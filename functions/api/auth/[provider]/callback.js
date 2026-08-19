import { completeOAuth } from '../../../lib/auth.js'

/** GET /api/auth/discord/callback — finishes sign-in and sets the session cookie. */
export async function onRequestGet(context) {
  return completeOAuth(context.request, context.env, context.params.provider)
}
