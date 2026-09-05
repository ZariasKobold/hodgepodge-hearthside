import { describe, it, expect } from 'vitest'
import { runReconcile } from './reconcile.js'
import { SyncError } from './remote.js'

/**
 * The loops, not the decision.
 *
 * `remote.test.js` covers `planSync` — what *ought* to happen. These cover what
 * actually gets carried out, which is the half that was never tested and the
 * half that broke. v0.21.1 shipped a `reconcile` with no arsenal push loop at
 * all; every test stayed green because `mirrorArsenal` pushes on every save and
 * the end-to-end test made a save, so the only broken path was the one nothing
 * walked — an arsenal already dirty before the app opened.
 *
 * The first test below is that path. It fails against the v0.21.1 code.
 */

/** A fake shelf, a fake account, and a log of every call that mattered. */
function harness({
  localCampaigns = [],
  localArsenals = [],
  remoteCampaigns = [],
  remoteArsenals = [],
  dirty = {},
  versions = {},
  putCampaign,
  putArsenal,
  pushDisabled = false,
  userId = 'u1',
} = {}) {
  const calls = []
  const saved = { campaigns: [], arsenals: [] }
  const marks = {}
  const remembered = {}

  const store = (list) => Object.fromEntries(list.map((d) => [d.id, d]))
  const campaigns = store(localCampaigns)
  const arsenals = store(localArsenals)

  const ports = {
    userId,
    pushDisabled,
    storage: {
      campaignIds: () => Object.keys(campaigns),
      loadCampaign: (id) => campaigns[id] || null,
      saveCampaign: (doc) => { saved.campaigns.push(doc); calls.push(['saveCampaign', doc.id]) },
      arsenalIds: () => Object.keys(arsenals),
      loadArsenal: (id) => arsenals[id] || null,
      saveArsenal: (doc) => { saved.arsenals.push(doc); calls.push(['saveArsenal', doc.id]) },
    },
    remote: {
      listCampaigns: async () => { calls.push(['listCampaigns']); return remoteCampaigns },
      listArsenals: async () => { calls.push(['listArsenals']); return remoteArsenals },
      putCampaign: async (doc, opts) => {
        calls.push(['putCampaign', doc.id, opts?.baseVersion ?? null])
        if (putCampaign) return putCampaign(doc, opts)
        return { saved: { version: (doc.version ?? 0) + 1 } }
      },
      putArsenal: async (doc, opts) => {
        calls.push(['putArsenal', doc.id, opts?.baseVersion ?? null])
        if (putArsenal) return putArsenal(doc, opts)
        return { saved: { version: (doc.version ?? 0) + 1 } }
      },
    },
    versions: {
      knownVersion: (id) => (id in versions ? versions[id] : null),
      rememberVersion: (id, v) => { remembered[id] = v },
      isDirty: (id) => (id in dirty ? dirty[id] : false),
      markDirty: (id, v) => { marks[id] = v },
    },
  }
  return { ports, calls, saved, marks, remembered }
}

const arsenal = (id, over = {}) => ({
  id, schemaVersion: 3, ownerUserId: 'u1', name: 'Leader', scrip: 3,
  models: [], updatedAt: 100, ...over,
})
const campaign = (id, over = {}) => ({
  id, schemaVersion: 3, ownerUserId: 'u1', weeks: [], games: [],
  updatedAt: 100, ...over,
})

const kinds = (calls, name) => calls.filter((c) => c[0] === name).map((c) => c[1])

describe('runReconcile — the arsenal push loop', () => {
  /**
   * THE v0.21.1 REGRESSION TEST.
   *
   * A dirty arsenal the account has never seen, with no save happening during
   * the session. This is adoption, and it is the state the sync pause left
   * every device in. Against the shipped v0.21.1 code this assertion fails:
   * the arsenal was planned for push and then nothing carried it out.
   */
  it('pushes an arsenal that was already dirty before the app opened', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1')],
      dirty: { ars_1: true },
    })
    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual(['ars_1'])
    expect(out.pushed).toBe(1)
    expect(out.status).toBe('synced')
  })

  it('records the version the server assigned, so the next save is not refused', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1')],
      dirty: { ars_1: true },
      putArsenal: async () => ({ saved: { version: 7 } }),
    })
    await runReconcile(h.ports)

    expect(h.remembered.ars_1).toBe(7)
    expect(h.marks.ars_1).toBe(false)
  })

  it('sends the version it was told, as the base for the write', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1')],
      remoteArsenals: [arsenal('ars_1', { version: 4, updatedAt: 50 })],
      dirty: { ars_1: true },
      versions: { ars_1: 4 },
    })
    await runReconcile(h.ports)

    const put = h.calls.find((c) => c[0] === 'putArsenal')
    expect(put).toEqual(['putArsenal', 'ars_1', 4])
  })

  it('does not push a clean arsenal', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1')],
      remoteArsenals: [arsenal('ars_1', { version: 1 })],
      dirty: { ars_1: false },
      versions: { ars_1: 1 },
    })
    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual([])
    expect(out.pushed).toBe(0)
  })
})

describe('runReconcile — ordering is load-bearing', () => {
  /**
   * `arsenals.campaign_id` references `campaigns(id)` and D1 enforces foreign
   * keys, so an arsenal pushed before its table names a row the server does not
   * have. This rule was asserted by a comment and nothing else.
   */
  it('pushes campaigns before arsenals', async () => {
    const h = harness({
      localCampaigns: [campaign('camp_1')],
      localArsenals: [arsenal('ars_1', { campaignId: 'camp_1' })],
      dirty: { camp_1: true, ars_1: true },
    })
    await runReconcile(h.ports)

    const order = h.calls
      .filter((c) => c[0] === 'putCampaign' || c[0] === 'putArsenal')
      .map((c) => c[0])
    expect(order).toEqual(['putCampaign', 'putArsenal'])
  })

  it('pulls campaigns before arsenals, for the same reason', async () => {
    const h = harness({
      remoteCampaigns: [campaign('camp_1', { version: 1 })],
      remoteArsenals: [arsenal('ars_1', { version: 1, campaignId: 'camp_1' })],
    })
    await runReconcile(h.ports)

    const order = h.calls
      .filter((c) => c[0] === 'saveCampaign' || c[0] === 'saveArsenal')
      .map((c) => c[0])
    expect(order.indexOf('saveCampaign')).toBeLessThan(order.lastIndexOf('saveArsenal'))
  })
})

describe('runReconcile — one failure does not stop the rest', () => {
  /**
   * An earlier version broke out of the push loop on the first failure, so a
   * single unpushable document kept everything behind it from ever reaching the
   * account (audit v0.11.0, H1).
   */
  it('keeps pushing arsenals after one is refused', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1'), arsenal('ars_2'), arsenal('ars_3')],
      dirty: { ars_1: true, ars_2: true, ars_3: true },
      putArsenal: async (doc) => {
        if (doc.id === 'ars_2') throw Object.assign(new Error('nope'), { stale: true })
        return { saved: { version: 1 } }
      },
    })
    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual(['ars_1', 'ars_2', 'ars_3'])
    expect(out.pushed).toBe(2)
    expect(out.status).toBe('failed')
    expect(out.error).toMatch(/try again/)
  })

  it('reports a stale arsenal in the player’s terms, not the server’s', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1')],
      dirty: { ars_1: true },
      putArsenal: async () => { throw Object.assign(new Error('pull before pushing'), { stale: true }) },
    })
    const out = await runReconcile(h.ports)

    expect(out.error).toBe('Another device saved this leader a moment ago. Nothing is lost; try again.')
  })
})

describe('runReconcile — conflicts', () => {
  it('pushes nothing for a conflicted arsenal and reports it', async () => {
    const h = harness({
      localArsenals: [arsenal('ars_1', { scrip: 9 })],
      remoteArsenals: [arsenal('ars_1', { scrip: 2, version: 5 })],
      dirty: { ars_1: true },
      versions: { ars_1: 3 },
    })
    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual([])
    expect(out.status).toBe('conflicted')
    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({ kind: 'arsenal', id: 'ars_1' })
  })

  /**
   * The regression this guards is subtle and was live: a conflict *means* the
   * server's version moved away from this device's base, so the two documents
   * always differ by that field at the moment the question is asked. Comparing
   * them raw made `sameInSubstance` return false every single time, and two
   * devices that had made the identical edit were handed a choice with no
   * difference in it.
   */
  it('settles a conflict where both copies say the same thing', async () => {
    const same = { scrip: 4, models: [{ id: 'm1', name: 'Rat', cost: 3 }] }
    const h = harness({
      localArsenals: [arsenal('ars_1', same)],
      remoteArsenals: [arsenal('ars_1', { ...same, version: 5, updatedAt: 999 })],
      dirty: { ars_1: true },
      versions: { ars_1: 3 },
    })
    const out = await runReconcile(h.ports)

    expect(out.conflicts).toHaveLength(0)
    expect(out.status).toBe('synced')
    expect(h.remembered.ars_1).toBe(5)
    expect(h.marks.ars_1).toBe(false)
  })
})

describe('runReconcile — refusing to act on a half-known picture', () => {
  it('does nothing at all when a listing fails', async () => {
    const h = harness({ localArsenals: [arsenal('ars_1')], dirty: { ars_1: true } })
    h.ports.remote.listArsenals = async () => { throw new Error('network down') }

    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual([])
    expect(kinds(h.calls, 'putCampaign')).toEqual([])
    expect(out.status).toBe('failed')
    expect(out.error).toBe('network down')
  })

  it('reads a signed-out listing as offline rather than failed', async () => {
    const h = harness()
    h.ports.remote.listCampaigns = async () => {
      throw Object.assign(new SyncError('signed out'), { signedOut: true })
    }
    const out = await runReconcile(h.ports)
    expect(out.status).toBe('offline')
  })

  it('refuses to touch anything without a user', async () => {
    const h = harness({ userId: null, localArsenals: [arsenal('ars_1')], dirty: { ars_1: true } })
    const out = await runReconcile(h.ports)

    expect(h.calls).toEqual([])
    expect(out.status).toBe('offline')
  })

  /**
   * Signing out clears nothing from localStorage. Without the ownership filter
   * the next account to sign in pushes the previous one's work, is refused, and
   * watches its own sync fail behind it (audit v0.11.0, H1).
   */
  it('ignores another account’s arsenals on the same browser', async () => {
    const h = harness({
      userId: 'u2',
      localArsenals: [arsenal('ars_1', { ownerUserId: 'u1' })],
      dirty: { ars_1: true },
    })
    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual([])
    expect(out.pushed).toBe(0)
  })
})

describe('runReconcile — the kill switch', () => {
  it('holds both kinds without attempting either when push is disabled', async () => {
    const h = harness({
      localCampaigns: [campaign('camp_1')],
      localArsenals: [arsenal('ars_1')],
      dirty: { camp_1: true, ars_1: true },
      pushDisabled: true,
    })
    const out = await runReconcile(h.ports)

    expect(kinds(h.calls, 'putArsenal')).toEqual([])
    expect(kinds(h.calls, 'putCampaign')).toEqual([])
    expect(out.held).toBe(2)
    expect(out.pushed).toBe(0)
  })
})

describe('runReconcile — pulling', () => {
  it('takes an arsenal the account has and this device does not', async () => {
    const h = harness({ remoteArsenals: [arsenal('ars_1', { version: 2 })] })
    const out = await runReconcile(h.ports)

    expect(h.saved.arsenals.map((a) => a.id)).toEqual(['ars_1'])
    expect(out.pulled).toBe(1)
    expect(out.changed).toBe(true)
    expect(h.remembered.ars_1).toBe(2)
  })

  it('stamps the owner onto anything it takes', async () => {
    const h = harness({ remoteArsenals: [arsenal('ars_1', { version: 2, ownerUserId: undefined })] })
    await runReconcile(h.ports)

    expect(h.saved.arsenals[0].ownerUserId).toBe('u1')
  })

  /**
   * `version` is per-device sync bookkeeping. `fromRow` bolts one onto every
   * remote document and it belongs in its own storage key — on the doc the next
   * keystroke wipes it, and it rides into the JSON export meaning nothing.
   *
   * The campaign path stripped it via `planPull` from the start; the arsenal
   * path never did, so every pulled leader carried a stale server version
   * around in localStorage. Found by writing this file (audit v0.21.1, H1).
   */
  it('never lets server bookkeeping ride into a stored arsenal', async () => {
    const h = harness({ remoteArsenals: [arsenal('ars_1', { version: 2 })] })
    await runReconcile(h.ports)

    expect(h.saved.arsenals[0]).not.toHaveProperty('version')
    // and it is still recorded where it does belong
    expect(h.remembered.ars_1).toBe(2)
  })

  it('reports changed=false when nothing came down', async () => {
    const h = harness({ localArsenals: [arsenal('ars_1')], dirty: { ars_1: true } })
    const out = await runReconcile(h.ports)
    expect(out.changed).toBe(false)
  })
})
