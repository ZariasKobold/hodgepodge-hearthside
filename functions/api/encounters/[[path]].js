import { currentUser, json, sameOrigin } from '../../lib/auth.js'
import {
  openSharedEncounter, listSharedEncounters, revealCrew, closeSeat,
} from '../../lib/encounterStore.js'

/**
 * The crew builder's shared session (Phase B). See `encounterStore.js` for
 * every rule; this file only routes.
 *
 *   GET    /api/encounters?table=:id        your open sessions at a table
 *   POST   /api/encounters                  { tableId, arsenalId, opponentArsenalId, week }
 *   POST   /api/encounters/:id/reveal       { crew }   once
 *   POST   /api/encounters/:id/close        your seat
 *
 * Its own namespace (§11). Every handler passes `user.id` from the session and
 * nothing takes an actor from the body. Refusals are 404, as in
 * `/api/membership/`: whether a table or a session exists is not a stranger's
 * question. Revealing twice is 409, because the player holding a real seat
 * deserves to know why.
 *
 * `no-store` on every answer: an opponent's crew must not sit in a cache, and
 * the service worker already never caches `/api/` (§4).
 */
export async function onRequest(context) {
  const { request, env, params } = context
  if (!env.DB) return json({ message: 'No database is bound to this deployment.' }, 503)

  if (request.method !== 'GET' && !sameOrigin(request)) {
    return json({ message: 'Cross-origin writes are not accepted.' }, 403)
  }

  const user = await currentUser(request, env)
  if (!user) return json({ message: 'Sign in to hire a crew with someone.' }, 401)

  const seg = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
  const method = request.method
  const body = method === 'GET' ? {} : await request.json().catch(() => ({}))
  const noStore = { 'Cache-Control': 'no-store, private' }
  const notFound = () => json({ message: 'Not found.' }, 404, noStore)

  try {
    return await route()
  } catch (err) {
    // Migration 0010 not applied to this database yet. The list answers empty
    // so an open Crew tab is quiet; anything that writes says plainly that
    // sharing is not set up (as /api/book does, audit v0.28.1 L6).
    if (!/no such table/i.test(String(err?.message || err))) throw err
    if (method === 'GET') return json({ encounters: [] }, 200, noStore)
    return json({ message: 'Hiring together is not set up on this server yet.' }, 503, noStore)
  }

  async function route() {
    if (method === 'GET' && seg.length === 0) {
      const table = new URL(request.url).searchParams.get('table')
      if (!table) return json({ message: 'Expected ?table=' }, 400, noStore)
      const result = await listSharedEncounters(user.id, table, env)
      return result.forbidden ? notFound() : json(result, 200, noStore)
    }

    if (method === 'POST' && seg.length === 0) {
      const result = await openSharedEncounter(user.id, {
        tableId: body.tableId,
        arsenalId: body.arsenalId,
        opponentArsenalId: body.opponentArsenalId,
        week: body.week,
      }, env)
      if (result.forbidden) return notFound()
      if (result.error === 'too-many-open') {
        return json({ message: 'Close some of your open games first.' }, 429, noStore)
      }
      if (result.error) return json({ message: 'Expected tableId, arsenalId and opponentArsenalId.' }, 400, noStore)
      return json(result, 201, noStore)
    }

    if (method === 'POST' && seg.length === 2 && seg[1] === 'reveal') {
      const result = await revealCrew(user.id, seg[0], body.crew, env)
      if (result.notFound) return notFound()
      if (result.conflict) return json({ message: 'Already revealed.' }, 409, noStore)
      if (result.error) return json({ message: 'That is not a crew.' }, 400, noStore)
      return json(result, 200, noStore)
    }

    if (method === 'POST' && seg.length === 2 && seg[1] === 'close') {
      const result = await closeSeat(user.id, seg[0], env)
      return result.notFound ? notFound() : json(result, 200, noStore)
    }

    return notFound()
  }
}
