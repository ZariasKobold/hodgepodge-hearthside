import { currentUser, json, sameOrigin } from '../../lib/auth.js'
import {
  listArsenals, getArsenal, putArsenal, deleteArsenal,
} from '../../lib/arsenalStore.js'

/**
 * The arsenal sync surface.
 *
 * Deliberately a mirror of `/api/campaigns`, statement for statement, rather
 * than something cleverer. Two kinds of object now sync, and the plan is
 * emphatic that the way to get that wrong is to let the second one drift from
 * the first — so the shapes of these two files should stay boringly identical
 * and diffable.
 *
 *   GET    /api/arsenals          every arsenal this account owns
 *   GET    /api/arsenals/:id      one of them
 *   PUT    /api/arsenals/:id      create or replace it, if you have seen the
 *                                 copy you are replacing. 409 if you have not.
 *   DELETE /api/arsenals/:id      remove it — the campaign is untouched
 *
 * Its own namespace under `/api/`, per §11: the register proxy is scoped to
 * `/api/v1/` precisely so new surfaces can sit beside it without a catch-all
 * swallowing `/api/auth/*`.
 *
 * Every handler passes `user.id` from the session into the store, never an id
 * from the request. There is no row-level security beneath this, so that
 * argument is the whole of the access control.
 */
export async function onRequest(context) {
  const { request, env, params } = context

  if (!env.DB) {
    return json({ message: 'No database is bound to this deployment.' }, 503)
  }

  // Reads are harmless cross-origin; writes are not.
  if (request.method !== 'GET' && !sameOrigin(request)) {
    return json({ message: 'Cross-origin writes are not accepted.' }, 403)
  }

  const user = await currentUser(request, env)
  if (!user) {
    return json({ message: 'Sign in to sync leaders.' }, 401)
  }

  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
  const id = segments[0] || null

  if (segments.length > 1) {
    return json({ message: 'No such route.' }, 404)
  }

  try {
    if (request.method === 'GET' && !id) {
      return json({ arsenals: await listArsenals(user.id, env) })
    }

    if (request.method === 'GET' && id) {
      const arsenal = await getArsenal(user.id, id, env)
      // 404 rather than 403 for somebody else's: whether an id exists is not a
      // question a stranger gets an answer to.
      return arsenal ? json({ arsenal }) : json({ message: 'Not found.' }, 404)
    }

    if (request.method === 'PUT' && id) {
      const body = await request.json().catch(() => null)
      const arsenal = body?.arsenal
      if (!arsenal || typeof arsenal !== 'object') {
        return json({ message: 'Expected { arsenal }.' }, 400)
      }
      if (arsenal.id !== id) {
        return json({ message: 'Arsenal id does not match the URL.' }, 400)
      }
      /**
       * No "it must have a leader" check, and that is deliberate.
       *
       * The campaigns route grew one of these — *a campaign needs at least one
       * arsenal* — which was true of v2 and became a rule that rejected every
       * v3 campaign. A validity rule written against the shape of the day
       * outlives the day.
       *
       * An arsenal with an empty leader is a real state: it is what the
       * creation wizard writes before anybody types a name.
       */
      const saved = await putArsenal(user.id, arsenal, env, {
        baseVersion: Number.isFinite(body.baseVersion) ? body.baseVersion : null,
      })

      if (saved?.invalid) return json({ message: saved.invalid }, 400)
      if (saved?.forbidden) return json({ message: 'Not found.' }, 404)
      if (saved?.stale) {
        return json({
          stale: true,
          serverVersion: saved.serverVersion,
          serverUpdatedAt: saved.serverUpdatedAt,
          message: 'This leader has changed since you last saw it. Pull before pushing.',
        }, 409)
      }
      /**
       * 409 as well, and on purpose.
       *
       * An outdated shape is the same *kind* of answer as a stale version —
       * "your copy is not one this row can accept" — and the client already
       * knows to stop and reconcile on a 409 rather than retry. A 400 would
       * read as a bug in the request and invite exactly the retry loop that
       * must not happen.
       */
      if (saved?.outdatedShape) {
        return json({
          stale: true,
          outdatedShape: true,
          storedSchemaVersion: saved.storedSchemaVersion,
          message: 'This browser is running an older version of the app. Reload before saving.',
        }, 409)
      }
      return json({ saved })
    }

    if (request.method === 'DELETE' && id) {
      const removed = await deleteArsenal(user.id, id, env)
      return removed?.deleted ? json({ deleted: id }) : json({ message: 'Not found.' }, 404)
    }

    return json({ message: `${request.method} is not supported here.` }, 405)
  } catch (err) {
    // Never let a database error take the app down with it — the client treats
    // a failed sync as "stay local" and carries on.
    return json({ message: `Sync failed: ${err?.message || 'unknown error'}` }, 500)
  }
}
