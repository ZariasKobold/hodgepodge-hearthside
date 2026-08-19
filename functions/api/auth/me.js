import { currentUser, json } from '../../lib/auth.js'

/** GET /api/auth/me — who am I, or null. Never 401s; signed out is a valid state. */
export async function onRequestGet(context) {
  const user = await currentUser(context.request, context.env)
  return json({ user })
}
