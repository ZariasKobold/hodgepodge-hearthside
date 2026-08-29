import { currentUser, json, sameOrigin, cookie, SESSION_COOKIE } from '../lib/auth.js'
import { deleteAccount } from '../lib/campaignStore.js'

/**
 * DELETE /api/account — erase the account and everything filed under it.
 *
 * The only personal data this project holds is what Discord hands over on
 * sign-in: a user id, a display name and an avatar URL. No email, no password,
 * no tokens — there are no columns for them. This is the control that makes
 * that claim mean something: without a way to remove the rows, "we hold very
 * little about you" is a promise with no exit.
 *
 * Deliberately requires an explicit confirmation in the body. A DELETE that
 * fires on a stray request is not a feature, and this is the one endpoint with
 * no undo — the JSON export is the only copy afterwards, which is why the UI
 * offers to take one first.
 */
export async function onRequest(context) {
  const { request, env } = context

  if (request.method !== 'DELETE') {
    return json({ message: 'Only DELETE is supported here.' }, 405)
  }
  if (!env.DB) {
    return json({ message: 'No database is bound to this deployment.' }, 503)
  }
  if (!sameOrigin(request)) {
    return json({ message: 'Cross-origin writes are not accepted.' }, 403)
  }

  const user = await currentUser(request, env)
  if (!user) {
    return json({ message: 'Sign in first.' }, 401)
  }

  const body = await request.json().catch(() => null)
  if (body?.confirm !== true) {
    return json({ message: 'Send { "confirm": true } to erase the account.' }, 400)
  }

  const result = await deleteAccount(user.id, env)

  // Clear the cookie on the way out. The session row is already gone, so the
  // browser would otherwise hold a key to a door that no longer exists.
  return json(
    { deleted: true, ...result },
    200,
    { 'Set-Cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) }
  )
}
