/**
 * Shared auth helpers for Pages Functions.
 *
 * OAuth only, no passwords — see docs/data-model.md §3. Rolling our own signup
 * would mean password hashes, reset flows, sending email and holding PII, on a
 * project we're contractually barred from monetizing. OAuth is less work AND
 * less liability, which is rare.
 */

export const SESSION_COOKIE = 'hh_session'
export const SESSION_DAYS = 30
const STATE_COOKIE = 'hh_oauth_state'

const rand = (bytes = 32) => {
  const a = new Uint8Array(bytes)
  crypto.getRandomValues(a)
  return [...a].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function cookie(name, value, { maxAge = 0, httpOnly = true } = {}) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ]
  if (httpOnly) parts.push('HttpOnly')
  return parts.join('; ')
}

export function readCookie(request, name) {
  const header = request.headers.get('Cookie') || ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

/* ── providers ──────────────────────────────────────────────────── */

export const PROVIDERS = {
  discord: {
    authorizeUrl: 'https://discord.com/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userUrl: 'https://discord.com/api/users/@me',
    scope: 'identify',
    idEnv: 'DISCORD_CLIENT_ID',
    secretEnv: 'DISCORD_CLIENT_SECRET',
    normalize: (u) => ({
      providerUserId: u.id,
      displayName: u.global_name || u.username,
      avatarUrl: u.avatar
        ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png`
        : null,
    }),
  },
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',
    scope: 'openid profile',
    idEnv: 'GOOGLE_CLIENT_ID',
    secretEnv: 'GOOGLE_CLIENT_SECRET',
    normalize: (u) => ({
      providerUserId: u.sub,
      displayName: u.name || 'Player',
      avatarUrl: u.picture || null,
    }),
  },
}

export function redirectUri(request, provider) {
  const url = new URL(request.url)
  return `${url.origin}/api/auth/${provider}/callback`
}

/** Step one: bounce to the provider with a signed-ish state cookie for CSRF. */
export function beginOAuth(request, env, providerName) {
  const p = PROVIDERS[providerName]
  if (!p) return json({ message: 'Unknown provider.' }, 404)

  const clientId = env[p.idEnv]
  if (!clientId) {
    return json({ message: `${providerName} is not configured on this deployment.` }, 501)
  }

  const state = rand(16)
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(request, providerName),
    response_type: 'code',
    scope: p.scope,
    state,
  })

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${p.authorizeUrl}?${params}`,
      'Set-Cookie': cookie(STATE_COOKIE, state, { maxAge: 600 }),
    },
  })
}

/** Step two: verify state, swap code for a profile, upsert user, start session. */
export async function completeOAuth(request, env, providerName) {
  const p = PROVIDERS[providerName]
  if (!p) return json({ message: 'Unknown provider.' }, 404)

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expected = readCookie(request, STATE_COOKIE)

  if (!code) return json({ message: 'No authorization code returned.' }, 400)
  if (!state || state !== expected) {
    return json({ message: 'State mismatch — start sign-in again.' }, 400)
  }

  const tokenRes = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env[p.idEnv],
      client_secret: env[p.secretEnv],
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(request, providerName),
    }),
  })
  if (!tokenRes.ok) return json({ message: 'Token exchange failed.' }, 502)
  const { access_token } = await tokenRes.json()

  const userRes = await fetch(p.userUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!userRes.ok) return json({ message: 'Could not read your profile.' }, 502)

  const profile = p.normalize(await userRes.json())
  const now = Date.now()

  // Upsert by (provider, provider_user_id) — never by display name, which changes.
  const existing = await env.DB.prepare(
    'SELECT id FROM users WHERE provider = ? AND provider_user_id = ?'
  ).bind(providerName, profile.providerUserId).first()

  let userId = existing?.id
  if (userId) {
    await env.DB.prepare(
      'UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?'
    ).bind(profile.displayName, profile.avatarUrl, userId).run()
  } else {
    userId = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO users (id, provider, provider_user_id, display_name, avatar_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(userId, providerName, profile.providerUserId, profile.displayName, profile.avatarUrl, now).run()
  }

  const sessionId = rand(32)
  const expiresAt = now + SESSION_DAYS * 86400000
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(sessionId, userId, now, expiresAt).run()

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': cookie(SESSION_COOKIE, sessionId, { maxAge: SESSION_DAYS * 86400 }),
    },
  })
}

/**
 * Is this state-changing request coming from our own page?
 *
 * `SameSite=Lax` on the session cookie already stops a cross-site form or fetch
 * from carrying it, so this is a second lock on the same door rather than the
 * only one. It costs a header comparison and it closes the gap if that cookie
 * attribute is ever loosened — which is exactly the kind of change that gets
 * made for an unrelated reason and quietly removes a protection nobody
 * remembered was load-bearing.
 *
 * Same-origin requests from a browser always carry `Origin` on a mutation. A
 * request with no Origin at all is a non-browser caller (curl, a script), which
 * cannot be riding somebody's ambient cookie, so it is allowed through to the
 * session check.
 */
export function sameOrigin(request) {
  const origin = request.headers.get('Origin')
  if (!origin) return true
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

/** Returns the signed-in user, or null. Expired sessions are swept on read. */
export async function currentUser(request, env) {
  const sessionId = readCookie(request, SESSION_COOKIE)
  if (!sessionId || !env.DB) return null

  const row = await env.DB.prepare(
    `SELECT u.id, u.display_name, u.avatar_url, u.provider, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`
  ).bind(sessionId).first()

  if (!row) return null
  if (row.expires_at < Date.now()) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
    return null
  }

  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    provider: row.provider,
  }
}
