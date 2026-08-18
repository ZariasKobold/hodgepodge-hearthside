/**
 * Cloudflare Pages Function — the production stand-in for Vite's dev proxy.
 *
 * `npm run dev` proxies /api through the dev server, so the browser never
 * makes a cross-origin request. That proxy does not exist in a production
 * build. This Function fills the gap: it runs on Cloudflare's edge, fetches
 * upstream server-side, and returns the result same-origin. CORS never applies.
 *
 * It also caches. The register is a donation-funded community project, so
 * every response is held at the edge for an hour — a hundred players building
 * leaders in the same keyword hit BiggerHat once, not a hundred times.
 *
 * Routing: the [[path]] filename is a catch-all, so this handles every
 * request under /api/. Our client calls /api/v1/keywords/... and upstream
 * serves the same shape, so paths pass through unchanged.
 */

const UPSTREAM = 'https://biggerhat.net'
const CACHE_SECONDS = 3600

export async function onRequestGet(context) {
  const url = new URL(context.request.url)
  const target = `${UPSTREAM}${url.pathname}${url.search}`

  const cache = caches.default
  const cacheKey = new Request(target, { method: 'GET' })

  const hit = await cache.match(cacheKey)
  if (hit) return hit

  let upstream
  try {
    upstream = await fetch(target, {
      headers: {
        Accept: 'application/json',
        // Identify ourselves so the maintainer can see who's calling.
        'User-Agent': 'HodgepodgeHearthside/0.1 (+https://hodgepodgehearthside.com)',
      },
    })
  } catch (err) {
    return json({ message: 'Could not reach the register.' }, 502)
  }

  if (!upstream.ok) {
    return json({ message: `Register returned ${upstream.status}.` }, upstream.status)
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
    },
  })

  context.waitUntil(cache.put(cacheKey, response.clone()))
  return response
}

/** Anything other than GET has no business here. */
export async function onRequest(context) {
  if (context.request.method !== 'GET') {
    return json({ message: 'Only GET is supported.' }, 405)
  }
  return context.next()
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
