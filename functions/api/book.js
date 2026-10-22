import { currentUser, json, sameOrigin } from '../lib/auth.js'
import { getBookText } from '../lib/bookStore.js'

/**
 * The campaign book's text, for signed-in players.
 *
 *   POST /api/book   { keys: [...] }  →  { key: text, ... }
 *
 * **POST for a read, deliberately.** The key list is long, and a GET with the
 * keys in the URL would put fragments of the book into browser history, proxy
 * logs and any referrer. The service worker is already forbidden from caching
 * anything under `/api/` (§4).
 *
 * Open to anyone signed in since v0.37.0 (owner decision). See `bookStore.js`
 * for what was retired and what is left.
 *
 * Its own namespace under `/api/`, per §11.
 */
export async function onRequest(context) {
  const { request, env } = context

  if (!env.DB) {
    return json({ message: 'No database is bound to this deployment.' }, 503)
  }

  if (request.method !== 'POST') {
    return json({ message: 'Use POST with a list of keys.' }, 405)
  }

  // A POST that reads, so the same-origin lock that guards writes guards this
  // too. There is no reason for another site to be asking on a user's behalf.
  if (!sameOrigin(request)) {
    return json({ message: 'Cross-origin requests are not accepted.' }, 403)
  }

  const user = await currentUser(request, env)
  if (!user) {
    // Not an error the client should surface: it simply means no text.
    return json({ message: 'Sign in to read the book text.' }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ message: 'Expected a JSON body.' }, 400)
  }

  const noStore = { 'Cache-Control': 'no-store, private' }

  try {
    return json(await getBookText(user.id, body?.keys, env), 200, noStore)
  } catch (err) {
    /*
     * Until migration 0007 is applied the honest answer is the empty one, not a
     * 500 on every signed-in page load (audit v0.28.1 L6). Anything else is a
     * real failure and still throws.
     */
    if (!/no such table/i.test(String(err?.message || err))) throw err
    return json({}, 200, noStore)
  }
}
