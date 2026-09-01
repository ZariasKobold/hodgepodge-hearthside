/**
 * Campaign membership: invites, members, and the shared arsenal read.
 *
 * A separate module from `campaignStore.js` on purpose. That file's whole
 * discipline is "every statement filters on `owner_user_id`", and it is easier
 * to keep true if the one place that reads *across* owners is somewhere else,
 * announcing itself. Everything here is the widening; nothing there is.
 *
 * ## The rule
 *
 *   > **Read** an arsenal if you are an active member of its campaign.
 *   > **Write** only your own. **Delete** only your own campaign.
 *
 * Nothing in this module writes another user's campaign, arsenal, or models.
 * The only rows it writes on someone else's behalf are membership rows — and
 * only the host may write those, only for their own campaign.
 *
 * ## Why writes were not widened
 *
 * The obvious shape for membership is one campaign row with several
 * contributors, which means `putCampaign` accepting a writer who is not the
 * owner. That is exactly the change that opened the `arsenal_models` hole in
 * v0.7.0: the DELETE that clears model rows has no owner column to guard on,
 * so a signed-in stranger wiped another player's models while the guarded
 * statements quietly did nothing. CLAUDE.md §12 names it as the risky one.
 *
 * So `campaignStore.js` is untouched. Every player owns their own campaign row;
 * membership is a pointer (`campaigns.member_of`) from their campaign to the
 * host's. See migration 0003.
 *
 * ## Two gates, because a link can be forwarded
 *
 * Redeeming an invite makes you `pending`. Only the host admitting you makes
 * you `active`, and only `active` reads anything. A forwarded link can put a
 * stranger's name in front of the host; it cannot put the host's players in
 * front of a stranger.
 *
 * ## What crosses the member boundary
 *
 * The campaign nickname, and nothing else, unless the member has opted in.
 * `share_identity` defaults to 0 — a privacy default that leaks is not a
 * setting, it is a formality — and `publicMember` below is the single place
 * that decides what leaves. Every read goes through it.
 *
 * ## Query budget
 *
 * D1's free plan caps a Worker at 50 queries and CLAUDE.md §12b bars a query
 * per member. `listSharedArsenals` is three statements regardless of how many
 * players are in the campaign.
 */

/** Same guard as `campaignStore.js`: no subject, no query. */
function requireSubject(userId, fn) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error(`${fn} was called without a user — refusing to touch the database.`)
  }
  return userId
}

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const MEMBER_PENDING = 'pending'
export const MEMBER_ACTIVE = 'active'

/* ── tokens ─────────────────────────────────────────────────────── */

/**
 * A token the database never sees.
 *
 * The row stores only a SHA-256 of it, so a dump of `campaign_invites` is
 * useless for getting into a campaign — the same reason a password is never
 * stored. 32 bytes from `crypto.getRandomValues`, base64url so it survives a
 * URL without escaping.
 */
export function mintToken(bytes = 32) {
  const raw = new Uint8Array(bytes)
  crypto.getRandomValues(raw)
  let s = ''
  for (const b of raw) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function hashToken(token) {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/* ── the gate ───────────────────────────────────────────────────── */

/**
 * What this user is to this campaign: `owner`, `active`, `pending` or null.
 *
 * One query, and every read below starts here. Returning a role rather than a
 * boolean means the caller cannot accidentally treat "pending" as "in" — which
 * is the whole of the second gate.
 */
export async function roleIn(userId, campaignId, env) {
  requireSubject(userId, 'roleIn')

  const row = await env.DB.prepare(
    `SELECT c.owner_user_id AS owner, m.status AS status
       FROM campaigns c
       LEFT JOIN campaign_members m
         ON m.campaign_id = c.id AND m.user_id = ?
      WHERE c.id = ?`
  ).bind(userId, campaignId).first()

  if (!row) return null
  if (row.owner === userId) return 'owner'
  if (row.status === MEMBER_ACTIVE) return 'active'
  if (row.status === MEMBER_PENDING) return 'pending'
  return null
}

const canRead = (role) => role === 'owner' || role === 'active'

/* ── invites ────────────────────────────────────────────────────── */

/**
 * Issue a single-use, expiring invite. Host only.
 *
 * Returns the raw token exactly once; it is not recoverable afterwards, because
 * only its hash is stored. A host who loses the link revokes it and issues
 * another, which is cheaper than making stored tokens readable.
 */
export async function createInvite(userId, campaignId, env, { note = '', ttlMs = INVITE_TTL_MS } = {}) {
  requireSubject(userId, 'createInvite')

  const role = await roleIn(userId, campaignId, env)
  if (role !== 'owner') return { forbidden: true }

  const token = mintToken()
  const now = Date.now()
  const invite = {
    id: `inv_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    expiresAt: now + Math.max(60_000, ttlMs),
  }

  await env.DB.prepare(
    `INSERT INTO campaign_invites
       (id, campaign_id, issued_by, token_hash, note, created_at, expires_at)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(
    invite.id, campaignId, userId, await hashToken(token),
    String(note).slice(0, 120), now, invite.expiresAt
  ).run()

  return { ...invite, token, campaignId, note }
}

/** Host only. Never returns `token_hash` — there is no reason for it to leave. */
export async function listInvites(userId, campaignId, env) {
  requireSubject(userId, 'listInvites')

  const role = await roleIn(userId, campaignId, env)
  if (role !== 'owner') return { forbidden: true }

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.note, i.created_at, i.expires_at,
            i.redeemed_at, i.revoked_at,
            u.display_name AS redeemed_by_name
       FROM campaign_invites i
       LEFT JOIN users u ON u.id = i.redeemed_by
      WHERE i.campaign_id = ?
      ORDER BY i.created_at DESC`
  ).bind(campaignId).all()

  const now = Date.now()
  return {
    invites: (results || []).map((r) => ({
      id: r.id,
      note: r.note || '',
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      redeemedAt: r.redeemed_at || null,
      redeemedByName: r.redeemed_by_name || null,
      revokedAt: r.revoked_at || null,
      state: r.revoked_at ? 'revoked'
        : r.redeemed_at ? 'redeemed'
        : r.expires_at < now ? 'expired'
        : 'open',
    })),
  }
}

/**
 * Host only. Revoking is a timestamp rather than a delete, so a host can see
 * that a link they sent was withdrawn rather than wondering where it went.
 */
export async function revokeInvite(userId, inviteId, env) {
  requireSubject(userId, 'revokeInvite')

  const invite = await env.DB.prepare(
    'SELECT campaign_id FROM campaign_invites WHERE id = ?'
  ).bind(inviteId).first()
  if (!invite) return { notFound: true }

  const role = await roleIn(userId, invite.campaign_id, env)
  if (role !== 'owner') return { forbidden: true }

  await env.DB.prepare(
    'UPDATE campaign_invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL'
  ).bind(Date.now(), inviteId).run()

  return { revoked: inviteId }
}

/**
 * Redeem a token. Any signed-in user; this is the one entry point strangers
 * reach, so every refusal is spelled out rather than collapsed into one.
 *
 * The single-use claim is enforced in the UPDATE's WHERE clause, not by the
 * SELECT above it — two requests arriving together both pass the read, and only
 * one can change a row that requires `redeemed_by IS NULL`.
 */
export async function redeemInvite(userId, token, env) {
  requireSubject(userId, 'redeemInvite')

  const hash = await hashToken(String(token || ''))
  const row = await env.DB.prepare(
    `SELECT id, campaign_id, expires_at, redeemed_by, revoked_at
       FROM campaign_invites WHERE token_hash = ?`
  ).bind(hash).first()

  if (!row) return { error: 'no-such-invite' }
  if (row.revoked_at) return { error: 'revoked' }
  if (row.redeemed_by) return { error: 'already-redeemed' }
  if (row.expires_at < Date.now()) return { error: 'expired' }

  const role = await roleIn(userId, row.campaign_id, env)
  if (role === 'owner') return { error: 'own-campaign' }
  if (role === 'active') return { error: 'already-a-member' }

  const now = Date.now()
  const claimed = await env.DB.prepare(
    `UPDATE campaign_invites
        SET redeemed_by = ?, redeemed_at = ?
      WHERE id = ? AND redeemed_by IS NULL AND revoked_at IS NULL AND expires_at >= ?`
  ).bind(userId, now, row.id, now).run()

  if ((claimed.meta?.changes ?? 0) === 0) return { error: 'already-redeemed' }

  // Pending, not active. The host still has to admit them (gate two).
  await env.DB.prepare(
    `INSERT INTO campaign_members (campaign_id, user_id, role, joined_at, status)
     VALUES (?,?,?,?,?)
     ON CONFLICT(campaign_id, user_id) DO NOTHING`
  ).bind(row.campaign_id, userId, 'player', now, MEMBER_PENDING).run()

  return { campaignId: row.campaign_id, status: MEMBER_PENDING }
}

/* ── members ────────────────────────────────────────────────────── */

/**
 * The one place that decides what identity leaves a campaign.
 *
 * Nickname always. Discord display name and avatar only where the member set
 * `share_identity`. Every read of a member goes through this, so there is one
 * function to check rather than one per query — and if a future query forgets
 * to call it, the missing fields are conspicuous rather than the extra ones.
 */
function publicMember(row, { viewerId, addressable = false } = {}) {
  const shared = row.share_identity === 1
  const isYou = row.user_id === viewerId

  /**
   * The account id is deliberately *not* here by default.
   *
   * It was, in the first draft, and the test that says "never sends another
   * player's user id" caught it. A user id outlives the campaign, is the same
   * id in every other campaign that account touches, and joins somebody's
   * arsenal to them permanently — which is exactly the correlation the
   * nickname exists to prevent. The page has no use for it: members are told
   * apart by nickname, and "which one is me" is a boolean.
   *
   * `addressable` is opt-in per call site, not derived from the role. The host
   * needs ids on the member list, because admitting and removing have to name a
   * row and the host already holds that power. The host does **not** need them
   * on the shared arsenal page, which is read-only — so that call site does not
   * ask for them, and the id never leaves.
   *
   * You always get your own, because it is yours.
   */
  return {
    ...(addressable || isYou ? { userId: row.user_id } : {}),
    isYou,
    nickname: row.nickname || '',
    status: row.status,
    role: row.role,
    joinedAt: row.joined_at,
    // Absent, not null, when not shared: a null reads as "they have no avatar".
    ...(shared ? { displayName: row.display_name, avatarUrl: row.avatar_url || null } : {}),
    sharesIdentity: shared,
  }
}

/**
 * Everyone in the campaign. The host sees pending applicants too, because
 * admitting them is their job; members see only who is actually in.
 */
export async function listMembers(userId, campaignId, env) {
  requireSubject(userId, 'listMembers')

  const role = await roleIn(userId, campaignId, env)
  if (!canRead(role)) return { forbidden: true }

  const { results } = await env.DB.prepare(
    `SELECT m.user_id, m.role, m.joined_at, m.status, m.nickname, m.share_identity,
            u.display_name, u.avatar_url
       FROM campaign_members m
       JOIN users u ON u.id = m.user_id
      WHERE m.campaign_id = ?
      ORDER BY m.joined_at ASC`
  ).bind(campaignId).all()

  const rows = (results || [])
    .filter((r) => role === 'owner' || r.status === MEMBER_ACTIVE)
    .map((r) => publicMember(r, { viewerId: userId, addressable: role === 'owner' }))

  return { members: rows, viewerRole: role }
}

/** Host only: turn a pending applicant into a member. Gate two. */
export async function admitMember(userId, campaignId, memberUserId, env) {
  requireSubject(userId, 'admitMember')

  const role = await roleIn(userId, campaignId, env)
  if (role !== 'owner') return { forbidden: true }

  const result = await env.DB.prepare(
    `UPDATE campaign_members SET status = ?
      WHERE campaign_id = ? AND user_id = ? AND status = ?`
  ).bind(MEMBER_ACTIVE, campaignId, memberUserId, MEMBER_PENDING).run()

  return (result.meta?.changes ?? 0) > 0 ? { admitted: memberUserId } : { notFound: true }
}

/**
 * Remove a member — the host removing anyone, or a member removing themselves.
 *
 * Also unlinks their campaign, so leaving actually leaves: a stale `member_of`
 * would keep their arsenal in the shared read. The unlink is scoped to the
 * departing user's own campaigns, so this never writes a row it does not own.
 */
export async function removeMember(userId, campaignId, memberUserId, env) {
  requireSubject(userId, 'removeMember')

  const role = await roleIn(userId, campaignId, env)
  const isSelf = userId === memberUserId
  if (role !== 'owner' && !isSelf) return { forbidden: true }
  if (!role) return { forbidden: true }

  await env.DB.batch([
    env.DB.prepare(
      'DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?'
    ).bind(campaignId, memberUserId),
    env.DB.prepare(
      'UPDATE campaigns SET member_of = NULL WHERE member_of = ? AND owner_user_id = ?'
    ).bind(campaignId, memberUserId),
  ])

  return { removed: memberUserId }
}

/**
 * Your own nickname and identity setting, in one campaign. Self only.
 *
 * Deliberately not something the host can set: a nickname the host could edit
 * would be a name put in someone's mouth, and `share_identity` is the member's
 * to give. The `WHERE user_id = ?` is the whole enforcement, and the caller
 * cannot pass a different id because there is no parameter for one.
 */
export async function setMemberProfile(userId, campaignId, patch, env) {
  requireSubject(userId, 'setMemberProfile')

  const role = await roleIn(userId, campaignId, env)
  if (!role) return { forbidden: true }

  const nickname = String(patch?.nickname ?? '').slice(0, 40)
  const share = patch?.shareIdentity ? 1 : 0

  const result = await env.DB.prepare(
    `UPDATE campaign_members SET nickname = ?, share_identity = ?
      WHERE campaign_id = ? AND user_id = ?`
  ).bind(nickname, share, campaignId, userId).run()

  return (result.meta?.changes ?? 0) > 0 ? { nickname, shareIdentity: share === 1 } : { notFound: true }
}

/**
 * Point one of your own campaigns at a host campaign — "this is the leader I am
 * bringing".
 *
 * Both halves are checked: you must be an active member of the host, and you
 * must own the campaign being linked. The second is what stops a member
 * attaching somebody else's arsenal to a campaign, and it is expressed as a
 * `WHERE owner_user_id = ?` on the UPDATE rather than as a prior read, so there
 * is no gap between checking and writing.
 */
export async function linkCampaign(userId, campaignId, hostCampaignId, env) {
  requireSubject(userId, 'linkCampaign')

  if (hostCampaignId) {
    const role = await roleIn(userId, hostCampaignId, env)
    if (role !== 'active') return { forbidden: true }
    if (campaignId === hostCampaignId) return { error: 'cannot-link-to-itself' }
  }

  const result = await env.DB.prepare(
    'UPDATE campaigns SET member_of = ? WHERE id = ? AND owner_user_id = ?'
  ).bind(hostCampaignId || null, campaignId, userId).run()

  return (result.meta?.changes ?? 0) > 0
    ? { linked: campaignId, to: hostCampaignId || null }
    : { forbidden: true }
}

/* ── the shared read ────────────────────────────────────────────── */

/**
 * Every participant's arsenal in one campaign, read-only.
 *
 * Reads the **projection columns**, never `doc`. That distinction is the point:
 * `doc` is the whole campaign — house rules, week log, games, everything the
 * owner has — and a member is entitled to the arsenal, which is public by the
 * rules of the game (p.14: "A player's arsenal sheet is always public
 * knowledge"), not to the rest of it.
 *
 * Three statements whatever the size of the group: the campaigns in the group,
 * their arsenals, then every model in one `IN (…)`. Never a query per member.
 */
export async function listSharedArsenals(userId, campaignId, env) {
  requireSubject(userId, 'listSharedArsenals')

  const role = await roleIn(userId, campaignId, env)
  if (!canRead(role)) return { forbidden: true }

  // The host campaign plus everything pointed at it.
  const { results: camps } = await env.DB.prepare(
    `SELECT id, owner_user_id, name, weeks_total, started_at, week_offset
       FROM campaigns
      WHERE id = ? OR member_of = ?`
  ).bind(campaignId, campaignId).all()

  const campaignIds = (camps || []).map((c) => c.id)
  if (campaignIds.length === 0) return { arsenals: [] }

  const marks = campaignIds.map(() => '?').join(',')
  const [{ results: arsenals }, { results: members }] = await Promise.all([
    env.DB.prepare(
      `SELECT a.id, a.campaign_id, a.user_id, a.faction, a.keyword_a, a.keyword_b,
              a.scrip, a.leader, a.crew_card, a.total_cost, a.updated_at,
              a.injuries, a.equipment, a.totem
         FROM arsenals a
        WHERE a.campaign_id IN (${marks})`
    ).bind(...campaignIds).all(),
    env.DB.prepare(
      `SELECT m.user_id, m.role, m.joined_at, m.status, m.nickname, m.share_identity,
              u.display_name, u.avatar_url
         FROM campaign_members m
         JOIN users u ON u.id = m.user_id
        WHERE m.campaign_id = ? AND m.status = ?`
    ).bind(campaignId, MEMBER_ACTIVE).all(),
  ])

  const ids = (arsenals || []).map((a) => a.id)
  let models = []
  if (ids.length > 0) {
    const modelMarks = ids.map(() => '?').join(',')
    const res = await env.DB.prepare(
      `SELECT id, arsenal_id, slug, name, cost, added_week, scrip_paid,
              title_group, annihilated
         FROM arsenal_models
        WHERE arsenal_id IN (${modelMarks})`
    ).bind(...ids).all()
    models = res.results || []
  }

  const byArsenal = new Map()
  for (const m of models) {
    if (!byArsenal.has(m.arsenal_id)) byArsenal.set(m.arsenal_id, [])
    byArsenal.get(m.arsenal_id).push({
      id: m.id,
      slug: m.slug,
      name: m.name,
      cost: m.cost,
      addedWeek: m.added_week,
      scripPaid: m.scrip_paid,
      titleGroup: m.title_group,
      annihilated: m.annihilated === 1,
    })
  }

  // The host is not in `campaign_members` — they own the thing — so their
  // entry is built from the campaign row and carries no identity at all
  // unless they have joined their own member list, which they have not.
  // `addressable` is deliberately not passed: this page is read-only, so no
  // caller — host included — has anything to do with another account's id here.
  const memberByUser = new Map(
    (members || []).map((m) => [m.user_id, publicMember(m, { viewerId: userId })])
  )
  const ownerOf = new Map((camps || []).map((c) => [c.id, c.owner_user_id]))

  return {
    viewerRole: role,
    arsenals: (arsenals || []).map((a) => ({
      id: a.id,
      campaignId: a.campaign_id,
      isHost: ownerOf.get(a.campaign_id) === ownerOf.get(campaignId),
      isMine: a.user_id === userId,
      // Never the raw user id of somebody else: it is an identifier that
      // outlives the campaign, and the page has no use for it.
      // The host is not in `campaign_members` — they own the thing — so they
      // have no nickname row and fall back to an anonymous entry. `isYou` is
      // still answered, because the page has to know which sheet is yours.
      member: memberByUser.get(a.user_id) || {
        isYou: a.user_id === userId,
        nickname: '',
        status: MEMBER_ACTIVE,
        sharesIdentity: false,
      },
      faction: a.faction,
      keywords: [a.keyword_a, a.keyword_b].filter(Boolean),
      scrip: a.scrip,
      leader: safeJson(a.leader, {}),
      crewCard: safeJson(a.crew_card, {}),
      injuries: safeJson(a.injuries, []),
      equipment: safeJson(a.equipment, []),
      totem: safeJson(a.totem, null),
      models: byArsenal.get(a.id) || [],
      totalCost: a.total_cost,
      updatedAt: a.updated_at,
    })),
  }
}

function safeJson(text, fallback) {
  if (text == null) return fallback
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

/** Every campaign this user may see a shared page for, host or member. */
export async function listMemberships(userId, env) {
  requireSubject(userId, 'listMemberships')

  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.owner_user_id, m.status,
            (SELECT COUNT(*) FROM campaign_members x
              WHERE x.campaign_id = c.id AND x.status = ?) AS member_count
       FROM campaigns c
       JOIN campaign_members m ON m.campaign_id = c.id
      WHERE m.user_id = ?`
  ).bind(MEMBER_ACTIVE, userId).all()

  return {
    memberships: (results || []).map((r) => ({
      campaignId: r.id,
      name: r.name || '',
      status: r.status,
      memberCount: r.member_count,
      isOwner: r.owner_user_id === userId,
    })),
  }
}
