/**
 * The client half of campaign membership.
 *
 * Imports nothing from React (§6). Every call can fail and the caller's answer
 * to failure is the same as everywhere else here: say so and carry on — a
 * campaign is playable with the shared page unreachable, because the arsenal
 * that matters is the local one.
 *
 * The one thing that is *not* local-first is this: membership lives only on the
 * server. There is no offline copy of who else is in your campaign, and there
 * should not be — a cached member list is a cached answer to "who may see my
 * data", and that is not a question to answer from a stale copy.
 */

const BASE = '/api/membership'

export class MembershipError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'MembershipError'
    this.status = status
    this.signedOut = status === 401
    /** 404 is what the server says for "not yours", deliberately. */
    this.notFound = status === 404
  }
}

async function call(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch {
    throw new MembershipError('Could not reach the campaign service.')
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new MembershipError(
      detail?.message || `The campaign service returned ${res.status}.`,
      { status: res.status }
    )
  }
  return res.json()
}

export const memberships = (opts) => call('', opts)
export const members = (campaignId, opts) => call(`/${campaignId}/members`, opts)
export const sharedArsenals = (campaignId, opts) => call(`/${campaignId}/arsenals`, opts)
export const invites = (campaignId, opts) => call(`/${campaignId}/invites`, opts)

export const issueInvite = (campaignId, { note } = {}) =>
  call(`/${campaignId}/invites`, { method: 'POST', body: { note: note || '' } })

export const revokeInvite = (inviteId) =>
  call(`/invites/${inviteId}`, { method: 'DELETE' })

export const redeem = (token) =>
  call('/redeem', { method: 'POST', body: { token } })

export const admit = (campaignId, userId) =>
  call(`/${campaignId}/admit`, { method: 'POST', body: { userId } })

export const remove = (campaignId, userId) =>
  call(`/${campaignId}/members/${userId}`, { method: 'DELETE' })

export const saveProfile = (campaignId, { nickname, shareIdentity }) =>
  call(`/${campaignId}/profile`, { method: 'PUT', body: { nickname, shareIdentity } })

export const link = (hostCampaignId, campaignId) =>
  call(`/${hostCampaignId}/link`, { method: 'PUT', body: { campaignId } })

/* ── the invite link ────────────────────────────────────────────── */

/**
 * `?invite=<token>` on the app's own origin.
 *
 * A query parameter rather than a path like `/join/<token>`, because this is a
 * single-page app on Cloudflare Pages: a real path needs a rewrite rule to
 * reach the app at all, and a rule that catches `/join/*` is one more thing to
 * get right in a place nothing tests. The root URL always works.
 */
export function inviteLink(token, origin = window.location.origin) {
  return `${origin}/?invite=${encodeURIComponent(token)}`
}

/** The token in the current URL, if this page was opened from an invite. */
export function inviteFromUrl(search = window.location.search) {
  const token = new URLSearchParams(search).get('invite')
  return token && token.trim() ? token.trim() : null
}

/**
 * Take the token out of the address bar once it has been used.
 *
 * Single-use tokens are spent, so leaving one in the URL means a reload tries
 * to redeem a dead token and shows a confusing failure — and it means the token
 * sits in browser history and in any screenshot of the tab. `replaceState`
 * rather than a navigation, so the back button is not left pointing at it.
 */
export function clearInviteFromUrl() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  const url = new URL(window.location.href)
  url.searchParams.delete('invite')
  window.history.replaceState({}, '', url.pathname + url.search + url.hash)
}

/** Why a redeem failed, in words a person can act on. */
export const REDEEM_REASONS = {
  'no-such-invite': 'That invite link is not one this app recognises. Ask for a fresh one.',
  revoked: 'That invite was withdrawn by whoever sent it. Ask for a fresh one.',
  'already-redeemed': 'That invite has already been used. They are single-use, so ask for a fresh one.',
  expired: 'That invite has expired. Ask for a fresh one.',
  'own-campaign': 'That is your own campaign — you are already the host of it.',
  'already-a-member': 'You are already in that campaign.',
}
