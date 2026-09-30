import { currentUser, json, sameOrigin } from '../lib/auth.js'
import { getBookText, getChallenge, answerChallenge, grantedTitles } from '../lib/bookStore.js'

/**
 * The campaign book's text, for signed-in players, for what they hold.
 *
 *   POST /api/book   { keys: [...] }  →  { key: text, ... }
 *
 * **POST for a read, deliberately.** The key list is long and would not fit a
 * query string comfortably, and — more to the point — a GET with the keys in
 * the URL would put fragments of the book into browser history, proxy logs and
 * any referrer. A body is neither cached nor logged by default, and the service
 * worker is already forbidden from caching anything under `/api/` (§4).
 *
 * The request is a **filter, not a grant**. `bookStore` computes what this
 * caller has actually earned from their own rows and answers only the
 * intersection, so asking for all 340 keys returns the handful you hold. See
 * that file's header for why entitlement is "what your arsenal holds" rather
 * than "you are signed in".
 *
 * Its own namespace under `/api/`, per §11 — the register proxy is scoped to
 * `/api/v1/` precisely so surfaces can sit beside it.
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
    // Not an error the client should surface: it simply means no text. The app
    // is fully usable signed out on a device that has played before (§12b).
    return json({ message: 'Sign in to read the book text you have earned.' }, 401)
  }

  let body
  try {
    body = await request.json()
  } catch {
    return json({ message: 'Expected a JSON body.' }, 400)
  }

  const noStore = { 'Cache-Control': 'no-store, private' }

  /**
   * Three actions on one route, chosen by `action` in the body.
   *
   * One file because they are one subject and share every guard above — a
   * second route would be a second place to forget the session check. See
   * `bookStore.js` for what each is allowed to answer.
   */
  const action = body?.action || 'text'

  if (action === 'status') {
    const titles = [...await grantedTitles(user.id, env)]
    return json({ titles }, 200, noStore)
  }

  if (action === 'challenge') {
    // Null means "already proved, or nothing to ask" — the client shows no gate
    // either way, which is what "asked once" means.
    const challenge = await getChallenge(user.id, body?.title, env)
    return json({ challenge }, 200, noStore)
  }

  if (action === 'answer') {
    const result = await answerChallenge(user.id, body?.challengeId, body?.answer, env)
    return json(result, 200, noStore)
  }

  const text = await getBookText(user.id, body?.keys, env)
  // Never cached anywhere between here and the tab. The text is licensed to
  // the reader, not to the network.
  return json(text, 200, noStore)
}
