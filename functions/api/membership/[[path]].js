import { currentUser, json, sameOrigin } from '../../lib/auth.js'
import {
  createInvite, listInvites, revokeInvite, redeemInvite,
  listMembers, admitMember, removeMember, setMemberProfile,
  linkCampaign, listSharedArsenals, listMemberships,
} from '../../lib/membershipStore.js'

/**
 * Campaign membership.
 *
 * Its own namespace under `/api/membership/`, not folded into
 * `/api/campaigns/`, for the reason CLAUDE.md §11 gives about catch-alls: a
 * route that grows a second purpose eventually swallows the first. It also
 * keeps the one surface that reads across owners visibly separate from the one
 * that never does.
 *
 *   GET    /api/membership                          campaigns you are in
 *   GET    /api/membership/:id/members              who is in one
 *   GET    /api/membership/:id/arsenals             everyone's arsenal
 *   POST   /api/membership/:id/invites              issue a link (host)
 *   GET    /api/membership/:id/invites              list them (host)
 *   DELETE /api/membership/invites/:inviteId        revoke one (host)
 *   POST   /api/membership/redeem                   { token }
 *   POST   /api/membership/:id/admit                { userId }  (host)
 *   DELETE /api/membership/:id/members/:userId      remove, or leave
 *   PUT    /api/membership/:id/profile              your nickname + sharing
 *   PUT    /api/membership/:id/link                 { campaignId } you bring
 *
 * Every handler passes `user.id` from the session. Nothing takes an actor from
 * the request body, and the store refuses to run without a subject at all.
 *
 * Refusals are 404, not 403, matching `/api/campaigns/`: whether a campaign id
 * exists is not a question a stranger gets an answer to. The one exception is
 * redeeming, where the reason genuinely matters to the person holding the link
 * — "this expired" and "this was withdrawn" are different things to be told.
 */
export async function onRequest(context) {
  const { request, env, params } = context

  if (!env.DB) {
    return json({ message: 'No database is bound to this deployment.' }, 503)
  }

  if (request.method !== 'GET' && !sameOrigin(request)) {
    return json({ message: 'Cross-origin writes are not accepted.' }, 403)
  }

  const user = await currentUser(request, env)
  if (!user) {
    return json({ message: 'Sign in to manage campaign membership.' }, 401)
  }

  const seg = Array.isArray(params.path) ? params.path : params.path ? [params.path] : []
  const method = request.method
  const body = method === 'GET' || method === 'DELETE'
    ? {}
    : await request.json().catch(() => ({}))

  const notFound = () => json({ message: 'Not found.' }, 404)

  try {
    /* GET /api/membership */
    if (method === 'GET' && seg.length === 0) {
      return json(await listMemberships(user.id, env))
    }

    /* POST /api/membership/redeem */
    if (method === 'POST' && seg.length === 1 && seg[0] === 'redeem') {
      const result = await redeemInvite(user.id, body.token, env)
      if (result.error) {
        // 200 with a reason rather than an error status: the person holding
        // the link needs to know *which* of these it is, and a 404 for all of
        // them would send them back to the host with nothing useful to say.
        return json({ ok: false, reason: result.error }, 200)
      }
      return json({ ok: true, ...result })
    }

    /* DELETE /api/membership/invites/:inviteId */
    if (method === 'DELETE' && seg.length === 2 && seg[0] === 'invites') {
      const result = await revokeInvite(user.id, seg[1], env)
      if (result.forbidden || result.notFound) return notFound()
      return json(result)
    }

    const campaignId = seg[0]
    if (!campaignId) return notFound()

    /* GET|POST /api/membership/:id/invites */
    if (seg[1] === 'invites' && seg.length === 2) {
      if (method === 'GET') {
        const result = await listInvites(user.id, campaignId, env)
        return result.forbidden ? notFound() : json(result)
      }
      if (method === 'POST') {
        const result = await createInvite(user.id, campaignId, env, {
          note: body.note || '',
          ...(Number.isFinite(body.ttlMs) ? { ttlMs: body.ttlMs } : {}),
        })
        return result.forbidden ? notFound() : json({ invite: result })
      }
    }

    /* GET /api/membership/:id/members */
    if (method === 'GET' && seg[1] === 'members' && seg.length === 2) {
      const result = await listMembers(user.id, campaignId, env)
      return result.forbidden ? notFound() : json(result)
    }

    /* DELETE /api/membership/:id/members/:userId */
    if (method === 'DELETE' && seg[1] === 'members' && seg.length === 3) {
      const result = await removeMember(user.id, campaignId, seg[2], env)
      return result.forbidden ? notFound() : json(result)
    }

    /* GET /api/membership/:id/arsenals */
    if (method === 'GET' && seg[1] === 'arsenals' && seg.length === 2) {
      const result = await listSharedArsenals(user.id, campaignId, env)
      return result.forbidden ? notFound() : json(result)
    }

    /* POST /api/membership/:id/admit */
    if (method === 'POST' && seg[1] === 'admit' && seg.length === 2) {
      if (typeof body.userId !== 'string' || !body.userId) {
        return json({ message: 'Expected { userId }.' }, 400)
      }
      const result = await admitMember(user.id, campaignId, body.userId, env)
      return result.forbidden || result.notFound ? notFound() : json(result)
    }

    /* PUT /api/membership/:id/profile */
    if (method === 'PUT' && seg[1] === 'profile' && seg.length === 2) {
      const result = await setMemberProfile(user.id, campaignId, {
        nickname: body.nickname,
        shareIdentity: body.shareIdentity,
      }, env)
      return result.forbidden || result.notFound ? notFound() : json(result)
    }

    /* PUT /api/membership/:id/link */
    if (method === 'PUT' && seg[1] === 'link' && seg.length === 2) {
      const result = await linkCampaign(user.id, body.campaignId, campaignId, env)
      if (result.error) return json({ message: result.error }, 400)
      return result.forbidden ? notFound() : json(result)
    }

    return json({ message: `${method} is not supported here.` }, 405)
  } catch (err) {
    return json({ message: `Membership failed: ${err?.message || 'unknown error'}` }, 500)
  }
}
