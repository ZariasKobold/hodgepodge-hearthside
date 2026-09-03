/**
 * The service worker — installability, and a shell that survives a bad
 * connection at a table.
 *
 * ## The rule that matters most here
 *
 * **Nothing under `/api/` is ever cached.** That path carries three things and
 * each of them forbids it independently:
 *
 *   - `/api/v1/*` is the BiggerHat proxy, which serves card text. CLAUDE.md §4
 *     bars persisting rules text *anywhere* — "not to a localStorage key, not
 *     to the JSON export, not to D1" — and a Cache Storage entry is exactly
 *     that: text on disk, outliving the tab, no longer refreshed by an errata.
 *     `src/lib/rules.js` goes to great lengths to hold that text only in a
 *     module-level Map that dies with the tab; a service worker quietly writing
 *     the same responses to disk would undo it.
 *   - `/api/auth/*` decides who is signed in. A cached answer is a stale
 *     identity.
 *   - `/api/campaigns/*` is the D1 mirror. A cached answer is somebody's
 *     twelve weeks, wrong.
 *
 * One `return` covers all three, and it is the first thing the fetch handler
 * does. Do not add an exception to it.
 *
 * ## What is cached
 *
 * The built shell (hashed `/assets/*`), the artwork, the manifest and icons,
 * and the webfonts. All of it is either content-hashed or immutable, so
 * cache-first is safe: a new deploy produces new URLs, and `index.html` is
 * fetched network-first so those new URLs are found.
 *
 * ## Why an SPA fallback must never be cached as an asset — v0.19.3
 *
 * This worker shipped in v0.14.0 caching any `res.ok` same-origin response
 * under the URL that was asked for. Cloudflare Pages answers a missing path
 * with `index.html` and a **200**, which is right for navigation and poison for
 * anything else — so during the window in a deploy where the new `index.html`
 * is live but its hashed bundle has not propagated, the browser asks for
 * `/assets/index-abc123.js`, receives HTML with a 200, and this worker files
 * that HTML under the JS URL. Cache-first then serves it forever: the module
 * fails its MIME check, nothing renders, and **reloading cannot fix it**
 * because the cache is authoritative. A white screen with no way out.
 *
 * Observed in production on 2026-09-03, on the first load after a deploy.
 *
 * Two guards, because either alone leaves a hole. Nothing HTML is written under
 * a non-navigation request, and nothing HTML is *served* for one either — the
 * second matters because caches poisoned before this shipped are already on
 * people's disks.
 *
 * ## `skipWaiting`, this once
 *
 * This worker deliberately had none: a new worker waited for the old one to be
 * released rather than swapping assets under a page mid-campaign. That
 * reasoning holds in general and fails exactly here — a browser with a poisoned
 * cache renders nothing, so the old worker keeps serving the poison through
 * every reload and the fix never activates. Nobody is mid-campaign on a blank
 * page. The assets are content-hashed, so an early swap cannot mismatch them.
 *
 * The cache version is bumped alongside, which is what actually rescues anyone
 * already broken: `activate` deletes every cache not in `KEEP`, so the poisoned
 * entry goes with the old names.
 */

const VERSION = 'hh-v2'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const FONTS = `${VERSION}-fonts`
const KEEP = [SHELL, ASSETS, FONTS]

const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

self.addEventListener('install', (event) => {
  // See the header. Only justified because the bug being fixed leaves the page
  // blank, so waiting politely means never recovering.
  self.skipWaiting()
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(['/', '/index.html', '/manifest.webmanifest']))
      // A failed precache must not block installation — the runtime caches
      // below will fill in on first use.
      .catch(() => undefined)
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

/**
 * Is this response the SPA fallback wearing an asset's URL?
 *
 * Pages answers a missing path with `index.html` and a 200, so the status says
 * nothing. The content type is the only honest signal.
 */
function isHtml(response) {
  return (response.headers.get('content-type') || '').includes('text/html')
}

/** Put a copy away, ignoring failures — a full disk is not worth an error. */
async function remember(cacheName, request, response) {
  try {
    const cache = await caches.open(cacheName)
    await cache.put(request, response)
  } catch { /* nothing to do about it */ }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // See the header. This is not an optimisation to revisit.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return

  // Webfonts: immutable, versioned URLs, and the whole look depends on them.
  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) remember(FONTS, request, res.clone())
            return res
          })
      )
    )
    return
  }

  if (url.origin !== self.location.origin) return

  /**
   * Navigations go to the network first, so a deploy is picked up on the next
   * load rather than whenever the cache happens to turn over. The cached copy
   * is the offline fallback, and it is what makes the installed app open at
   * all without a connection.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) remember(SHELL, '/index.html', res.clone())
          return res
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || caches.match('/')))
    )
    return
  }

  // Everything else same-origin: hashed bundles, artwork, icons. Cache-first,
  // because these URLs never change meaning.
  event.respondWith(
    caches.match(request).then((hit) => {
      // A cached HTML body under an asset URL is poison from a worker older
      // than v0.19.3. Ignore it and go to the network, which is now correct.
      if (hit && !isHtml(hit)) return hit
      return fetch(request).then((res) => {
        // Never file the SPA fallback under an asset URL. This is the write
        // that broke the app in production.
        if (res.ok && res.type === 'basic' && !isHtml(res)) {
          remember(ASSETS, request, res.clone())
        }
        return res
      })
    })
  )
})
