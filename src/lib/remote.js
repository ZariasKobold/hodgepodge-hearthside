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
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'SyncError'
    this.status = status
    /** 401 means "not signed in", which is a state, not a fault. */
    this.signedOut = status === 401
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
    throw new SyncError(detail?.message || `Sync returned ${res.status}.`, { status: res.status })
  }
  return res.json()
}

export const remote = {
  list: (opts) => call('', opts).then((j) => j.campaigns || []),
  get: (id, opts) => call(`/${encodeURIComponent(id)}`, opts).then((j) => j.campaign),
  put: (campaign, opts) =>
    call(`/${encodeURIComponent(campaign.id)}`, { ...opts, method: 'PUT', body: { campaign } }),
  remove: (id, opts) => call(`/${encodeURIComponent(id)}`, { ...opts, method: 'DELETE' }),
}

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
