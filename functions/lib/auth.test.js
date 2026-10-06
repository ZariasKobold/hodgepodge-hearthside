import { describe, it, expect, vi, afterEach } from 'vitest'
import { completeOAuth } from './auth.js'

/**
 * The OAuth state cookie is single-use (audit v0.28.1 L1). It used to be left
 * in the browser for the rest of its ten minutes after sign-in had consumed it.
 */

const callback = (state, cookieState = state) => new Request(
  `https://hodgepodgehearthside.com/api/auth/discord/callback?code=c&state=${state}`,
  { headers: { Cookie: `hh_oauth_state=${cookieState}` } }
)

const env = {
  DISCORD_CLIENT_ID: 'id',
  DISCORD_CLIENT_SECRET: 'secret',
  DB: {
    prepare: () => {
      const api = {
        bind: () => api,
        first: async () => null,
        run: async () => ({ meta: { changes: 1 } }),
      }
      return api
    },
  },
}

const cookies = (res) => (res.headers.getSetCookie?.() ?? [res.headers.get('Set-Cookie')]).join('\n')

afterEach(() => vi.unstubAllGlobals())

describe('the OAuth state cookie', () => {
  it('is cleared when sign-in succeeds, beside the new session', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('token')
      ? Response.json({ access_token: 't' })
      : Response.json({ id: '1', username: 'zarias' }))))
    const res = await completeOAuth(callback('abc'), env, 'discord')
    expect(res.status).toBe(302)
    expect(cookies(res)).toMatch(/hh_session=[0-9a-f]+/)
    expect(cookies(res)).toMatch(/hh_oauth_state=; .*Max-Age=0/)
  })

  it('is cleared when the token exchange fails after the state was checked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 400 })))
    const res = await completeOAuth(callback('abc'), env, 'discord')
    expect(res.status).toBe(502)
    expect(cookies(res)).toMatch(/hh_oauth_state=; .*Max-Age=0/)
  })

  it('is left alone on a mismatch, which may be a stale tab', async () => {
    const res = await completeOAuth(callback('abc', 'other'), env, 'discord')
    expect(res.status).toBe(400)
    expect(res.headers.get('Set-Cookie')).toBeNull()
  })
})
