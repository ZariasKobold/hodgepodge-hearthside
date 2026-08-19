import { beginOAuth, json } from '../../lib/auth.js'

/** GET /api/auth/discord — starts sign-in. */
export async function onRequestGet(context) {
  const { provider } = context.params
  if (provider === 'me' || provider === 'logout') return context.next()
  return beginOAuth(context.request, context.env, provider)
}
