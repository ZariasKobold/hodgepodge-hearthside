import { SESSION_COOKIE, cookie, readCookie, json } from '../../lib/auth.js'

export async function onRequestPost(context) {
  const sessionId = readCookie(context.request, SESSION_COOKIE)
  if (sessionId && context.env.DB) {
    await context.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  }
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(SESSION_COOKIE, '', { maxAge: 0 }) })
}
