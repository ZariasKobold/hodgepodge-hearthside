/**
 * The remote half of storage.
 *
 * Local is not a stepping stone to this — it is the fallback that has to keep
 * working (CLAUDE.md §12). So the arrangement is deliberately lopsided:
 * localStorage is written synchronously and is always authoritative for the
 * running app; this pushes a copy to D1 and pulls what the account already
 * holds. Every function here can fail, and the caller's answer to failure is
 * always "carry on locally".
 *
 * Imports nothing from React (§6).
 */

const BASE = '/api/campaigns'

export class SyncError extends Error {
  constructor(message, { status, serverUpdatedAt } = {}) {
    super(message)
    this.name = 'SyncError'
    this.status = status
    /** 401 means "not signed in", which is a state, not a fault. */
    this.signedOut = status === 401
    /**
     * 409 means "your copy is behind", which is also a state and not a fault.
     * The local edit is intact; it simply may not overwrite what is there.
     */
    this.stale = status === 409
    /** What the server has, so the caller can reconcile without asking again. */
    this.serverUpdatedAt = serverUpdatedAt ?? null
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
    throw new SyncError('Could not reach the sync service.')
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new SyncError(detail?.message || `Sync returned ${res.status}.`, {
      status: res.status,
      serverUpdatedAt: detail?.serverUpdatedAt,
    })
  }
  return res.json()
}

/**
 * Erases the account and everything on it.
 *
 * Its own call rather than a `remote` method: this is not campaign sync, it is
 * the end of the relationship, and it should not sit in a list of routine
 * operations where it could be reached by a loop.
 */
export async function deleteAccount() {
  const res = await fetch('/api/account', {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new SyncError(detail?.message || `Delete returned ${res.status}.`, { status: res.status })
  }
  return res.json()
}

export const remote = {
  list: (opts) => call('', opts).then((j) => j.campaigns || []),
  get: (id, opts) => call(`/${encodeURIComponent(id)}`, opts).then((j) => j.campaign),
  /**
   * `baseVersion` is the version the server last handed this device for this
   * campaign — passed in by the caller from its own store, never read off the
   * campaign and never derived from `updatedAt`, which is a local clock reading
   * and is exactly what cannot be trusted here.
   *
   * It is a parameter rather than a field for a reason that cost a debugging
   * round: as a field on the campaign it was wiped by the next local edit,
   * because the campaign is React state and that state does not know about
   * fields the sync layer adds behind it. Absent means "never seen the server's
   * copy", which the server treats as a conflict rather than as permission.
   */
  put: (campaign, { baseVersion = null, ...opts } = {}) =>
    call(`/${encodeURIComponent(campaign.id)}`, {
      ...opts,
      method: 'PUT',
      body: {
        campaign,
        baseVersion: Number.isFinite(baseVersion) ? baseVersion : null,
      },
    }),
  remove: (id, opts) => call(`/${encodeURIComponent(id)}`, { ...opts, method: 'DELETE' }),
}

/**
 * Stamps a campaign as this account's, refusing without an account.
 *
 * The client-side echo of `requireSubject` in `campaignStore.js`, and here for
 * the same reason: it turns a missing user from something that explodes
 * halfway through a loop into something that refuses before touching anything.
 *
 * It exists because it did explode. `useSync`'s reconcile captured `user` in a
 * stale closure and ran with `user === null`, so the pull loop threw
 * `Cannot read properties of null` on its first campaign — after `remote.list`
 * had succeeded, and with no catch around it. The rejection was unhandled, the
 * status never left `syncing`, and the shelf said "Checking your account for
 * campaigns…" for ever while the campaign sat on the server. A guard that names
 * the problem is worth more than a crash three lines later.
 */
export function stampOwner(campaign, userId) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new SyncError('Tried to file a campaign without an account — refusing.')
  }
  return { ...campaign, ownerUserId: userId }
}

/* `stampSynced` lived here and is gone. The version it wrote onto the campaign
   was erased by the next local edit — see `knownVersion` in storage.js, which
   keeps it in its own key where React state cannot reach it. */

/**
 * Works out what to do with a shelf that exists in two places.
 *
 * Pure, and separated from the network on purpose: this is the part that can
 * lose somebody's twelve weeks, so it is the part that gets tested.
 *
 * Three cases, and the third is the one the owner asked for:
 *
 *   remote only  → pull it down; a campaign built on another device
 *   both         → newer `updatedAt` wins; ties keep local, since the local
 *                  copy is the one the running app already has in hand
 *   local only   → push it up. This is the adoption case: everything built
 *                  before signing in, or while signed out, becomes theirs on
 *                  the account the moment they log in.
 *
 * A remote row that failed to parse server-side arrives flagged `corrupt` and
 * is treated as absent, so a damaged row can never overwrite a good local copy.
 */
export function planSync(localCampaigns, remoteCampaigns) {
  const localById = new Map(localCampaigns.map((c) => [c.id, c]))
  const remoteById = new Map(
    remoteCampaigns.filter((c) => c && c.id && !c.corrupt).map((c) => [c.id, c])
  )

  const pull = []
  const push = []

  for (const [id, mine] of localById) {
    const theirs = remoteById.get(id)
    if (!theirs) {
      push.push(mine)
      continue
    }
    const mineAt = mine.updatedAt ?? 0
    const theirsAt = theirs.updatedAt ?? 0
    if (theirsAt > mineAt) pull.push(theirs)
    else if (mineAt > theirsAt) push.push(mine)
  }

  for (const [id, theirs] of remoteById) {
    if (!localById.has(id)) pull.push(theirs)
  }

  return { pull, push, adopted: push.filter((c) => !remoteById.has(c.id)).map((c) => c.id) }
}
