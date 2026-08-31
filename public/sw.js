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
 * No `skipWaiting`. A new worker waits for the old one to be released rather
 * than swapping assets under a page that is mid-campaign.
 */

const VERSION = 'hh-v1'
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const FONTS = `${VERSION}-fonts`
const KEEP = [SHELL, ASSETS, FONTS]

const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']

self.addEventListener('install', (event) => {
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
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          if (res.ok && res.type === 'basic') remember(ASSETS, request, res.clone())
          return res
        })
    )
  )
})
