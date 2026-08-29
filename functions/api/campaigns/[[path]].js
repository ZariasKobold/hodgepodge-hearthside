import { currentUser, json, sameOrigin } from '../../lib/auth.js'
import {
  listCampaigns, getCampaign, putCampaign, deleteCampaign,
} from '../../lib/campaignStore.js'

/**
 * The campaign sync surface.
 *
 * Scoped to `/api/campaigns/` rather than `/api/`, per CLAUDE.md §11 — a
 * catch-all at `/api/` would swallow `/api/auth/*` and `/api/v1/*`.
 *
 *   GET    /api/campaigns          every campaign this account owns
 *   GET    /api/campaigns/:id      one of them
 *   PUT    /api/campaigns/:id      create or replace it
 *   DELETE /api/campaigns/:id      remove it
 *
 * Unlike `/api/auth/me`, these **do** 401 when signed out. Signed out is a
 * valid state for the app and not a valid state for someone else's data.
 *
 * Every handler passes `user.id` from the session into the store, never an id
 * from the request. There is no row-level security under this (D1 is SQLite),
 * so that argument is the whole of the access control.
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
    return json({ message: 'Sign in to sync campaigns.' }, 401)
  }

  // `path` is the [[path]] catch-all: [] for the collection, ['<id>'] for one.
  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
  const id = segments[0] || null

  if (segments.length > 1) {
    return json({ message: 'No such route.' }, 404)
  }

  try {
    if (request.method === 'GET' && !id) {
      return json({ campaigns: await listCampaigns(user.id, env) })
    }

    if (request.method === 'GET' && id) {
      const campaign = await getCampaign(user.id, id, env)
      // 404 rather than 403 for someone else's campaign: whether an id exists
      // is not a question a stranger gets an answer to.
      return campaign ? json({ campaign }) : json({ message: 'Not found.' }, 404)
    }

    if (request.method === 'PUT' && id) {
      const body = await request.json().catch(() => null)
      const campaign = body?.campaign
      if (!campaign || typeof campaign !== 'object') {
        return json({ message: 'Expected { campaign }.' }, 400)
      }
      if (campaign.id !== id) {
        return json({ message: 'Campaign id does not match the URL.' }, 400)
      }
      if (!Array.isArray(campaign.arsenals) || campaign.arsenals.length === 0) {
        return json({ message: 'A campaign needs at least one arsenal.' }, 400)
      }
      const saved = await putCampaign(user.id, campaign, env)
      // 404 rather than 403, matching GET: whether an id exists is not a
      // question a stranger gets an answer to.
      if (saved?.forbidden) return json({ message: 'Not found.' }, 404)
      return json({ saved })
    }

    if (request.method === 'DELETE' && id) {
      const removed = await deleteCampaign(user.id, id, env)
      return removed ? json({ deleted: id }) : json({ message: 'Not found.' }, 404)
    }

    return json({ message: `${request.method} is not supported here.` }, 405)
  } catch (err) {
    // Never let a database error take the app down with it — the client treats
    // a failed sync as "stay local" and keeps working.
    return json({ message: `Sync failed: ${err?.message || 'unknown error'}` }, 500)
  }
}
