import { describe, it, expect } from 'vitest'
import { planSync, stampOwner, SyncError } from './remote.js'

/* `planSync` decides which copy of a campaign survives. It is the only piece of
   the sync path that can destroy somebody's twelve weeks, so it is pure and it
   is tested; the network either side of it is not. */

const campaign = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra })

describe('planSync', () => {
  it('pushes a campaign the account has never seen — the adoption case', () => {
    const plan = planSync([campaign('a', 100)], [])
    expect(plan.push.map((c) => c.id)).toEqual(['a'])
    expect(plan.pull).toEqual([])
    expect(plan.adopted).toEqual(['a'])
  })

  it('adopts everything built while signed out, not just the open one', () => {
    const plan = planSync(
      [campaign('a', 100), campaign('b', 200), campaign('c', 300)],
      []
    )
    expect(plan.push).toHaveLength(3)
    expect(plan.adopted.sort()).toEqual(['a', 'b', 'c'])
  })

  it('pulls a campaign built on another device', () => {
    const plan = planSync([], [campaign('z', 500)])
    expect(plan.pull.map((c) => c.id)).toEqual(['z'])
    expect(plan.push).toEqual([])
    expect(plan.adopted).toEqual([])
  })

  it('lets the newer copy win in both directions', () => {
    const remoteNewer = planSync([campaign('a', 100)], [campaign('a', 900)])
    expect(remoteNewer.pull.map((c) => c.id)).toEqual(['a'])
    expect(remoteNewer.push).toEqual([])

    const localNewer = planSync([campaign('a', 900)], [campaign('a', 100)])
    expect(localNewer.push.map((c) => c.id)).toEqual(['a'])
    expect(localNewer.pull).toEqual([])
  })

  it('does nothing when the two agree', () => {
    const plan = planSync([campaign('a', 400)], [campaign('a', 400)])
    expect(plan.push).toEqual([])
    expect(plan.pull).toEqual([])
  })

  it('counts an overwrite as pushed but not adopted', () => {
    // Already on the account, just newer here. Not a new association.
    const plan = planSync([campaign('a', 900)], [campaign('a', 100)])
    expect(plan.push.map((c) => c.id)).toEqual(['a'])
    expect(plan.adopted).toEqual([])
  })

  it('treats a corrupt remote row as absent, so it cannot overwrite good local data', () => {
    const plan = planSync(
      [campaign('a', 100)],
      [{ id: 'a', updatedAt: 9999, corrupt: true }]
    )
    expect(plan.pull).toEqual([])
    expect(plan.push.map((c) => c.id)).toEqual(['a'])
  })

  it('treats a missing timestamp as the oldest possible, never the newest', () => {
    // A campaign saved before updatedAt existed must not win against a real one.
    const plan = planSync([{ id: 'a' }], [campaign('a', 1)])
    expect(plan.pull.map((c) => c.id)).toEqual(['a'])
    expect(plan.push).toEqual([])
  })

  it('handles both shelves at once without losing either side', () => {
    const plan = planSync(
      [campaign('local-only', 10), campaign('shared', 900)],
      [campaign('remote-only', 20), campaign('shared', 100)]
    )
    expect(plan.push.map((c) => c.id).sort()).toEqual(['local-only', 'shared'])
    expect(plan.pull.map((c) => c.id)).toEqual(['remote-only'])
    expect(plan.adopted).toEqual(['local-only'])
  })

  it('survives junk on either side', () => {
    const plan = planSync([], [null, undefined, { updatedAt: 5 }])
    expect(plan.pull).toEqual([])
    expect(plan.push).toEqual([])
  })

  it('keeps every field of the campaign it moves', () => {
    const rich = campaign('a', 100, { arsenals: [{ id: 'ars', models: [{ id: 'm' }] }] })
    const plan = planSync([rich], [])
    expect(plan.push[0].arsenals[0].models[0].id).toBe('m')
  })
})

/**
 * The guard that would have caught the stale-closure bug in `useSync`.
 *
 * Reconcile captured `user` from the first render — before `useAuth` had
 * answered — so it ran with `user === null`, and `{ ...campaign, ownerUserId:
 * user.id }` threw partway through the pull loop with nothing to catch it. The
 * status never left `syncing`, the shelf spun for ever, and a campaign sitting
 * perfectly intact on the server never came down to the second device.
 *
 * The deps are fixed. This is the second lock: a missing account now refuses
 * before anything is written, and says which problem it is.
 */
describe('stampOwner', () => {
  const campaign = { id: 'cmp_1', arsenals: [] }

  it('files a campaign against an account', () => {
    expect(stampOwner(campaign, 'usr_a')).toEqual({ ...campaign, ownerUserId: 'usr_a' })
  })

  it('overwrites a previous owner rather than keeping it', () => {
    // The server handed this back for *this* session, so it is theirs by
    // definition — whatever the doc happened to say.
    expect(stampOwner({ ...campaign, ownerUserId: 'usr_old' }, 'usr_a').ownerUserId).toBe('usr_a')
  })

  it('does not mutate the campaign it was given', () => {
    const original = { id: 'cmp_1', arsenals: [] }
    stampOwner(original, 'usr_a')
    expect(original).not.toHaveProperty('ownerUserId')
  })

  it('refuses without an account, and says so', () => {
    for (const bad of [null, undefined, '', 0, false, {}]) {
      expect(() => stampOwner(campaign, bad)).toThrow(/without an account/)
    }
  })

  /**
   * The exact shape of the bug: `user` is null, so `user.id` is a TypeError
   * three lines into a loop. Now it is a named refusal before the first write.
   */
  it('throws a SyncError, not a TypeError, when the user never loaded', () => {
    const user = null
    expect(() => stampOwner(campaign, user?.id)).toThrow(SyncError)
    expect(() => stampOwner(campaign, user?.id)).not.toThrow(TypeError)
  })
})

/**
 * The deadlock the version check created, and the shape of its fix.
 *
 * `baseVersion` may only ever be a version the server stated. The first
 * implementation learned one from exactly two events — a pull, or an accepted
 * push — and that turned out to be a trap: a device whose local copy was
 * *newer* than the server's reaches neither. It never pulls, because it is
 * ahead; its push is refused, because it has no base version. The shelf reads
 * "not saved to your account" for ever with no way out, and every device
 * already holding work was in that position the moment the check shipped.
 *
 * `remote.list()` is the third statement of a version, and the one that breaks
 * the cycle: the listing carries `updatedAt` for every campaign, which *is* the
 * server saying what it holds. `useSync` records those before deciding what to
 * push, so the push that follows has a legitimate base version.
 *
 * These assert the property that makes that safe rather than a loophole: a
 * listing tells you the version of every campaign in it, including the ones you
 * are about to push.
 */
describe('the listing states a version for everything in it', () => {
  const remoteRow = (id, updatedAt, extra = {}) => ({ id, updatedAt, ...extra })

  it('covers campaigns that will be pushed, not just pulled', () => {
    const local = [campaign('cmp_ahead', 900)]          // newer here
    const theirs = [remoteRow('cmp_ahead', 100)]        // older there
    const { push, pull } = planSync(local, theirs)

    expect(push.map((c) => c.id)).toEqual(['cmp_ahead'])
    expect(pull).toHaveLength(0)
    // Nothing in the pull path would have recorded a version for this id, which
    // is precisely why recording has to happen from the listing instead.
    expect(theirs[0].updatedAt).toBe(100)
  })

  it('says nothing about a campaign the server has never seen', () => {
    // Adoption: no row, so no version, and the server allows the write because
    // there is nothing to conflict with.
    const { push } = planSync([campaign('cmp_new', 900)], [])
    expect(push.map((c) => c.id)).toEqual(['cmp_new'])
  })

  it('skips corrupt rows, which state nothing trustworthy', () => {
    const theirs = [remoteRow('cmp_bad', 100, { corrupt: true })]
    const { pull, push } = planSync([campaign('cmp_bad', 50)], theirs)
    // A row we could not parse must not overwrite a good local copy, and its
    // `updatedAt` must not be adopted as a base version either.
    expect(pull).toHaveLength(0)
    expect(push.map((c) => c.id)).toEqual(['cmp_bad'])
  })
})


/**
 * The version-aware path, added in v0.18.5 with migration 0004.
 *
 * These are the tests that matter most in this file. Every case below was
 * decided by comparing two client clocks until now, and that comparison lost a
 * leader portrait twice in production.
 *
 * The facts `planSync` is given: `baseOf(id)` — the server-assigned version
 * this copy descends from — and `isDirty(id)` — whether it has been edited
 * since. Both must be known, or it falls back to the old comparison rather than
 * reasoning from half a picture.
 */
describe('planSync, deciding on versions rather than clocks', () => {
  const facts = (base, dirty) => ({ baseOf: () => base, isDirty: () => dirty })
  const mine = (updatedAt) => campaign('a', updatedAt)
  const theirs = (version, updatedAt) => campaign('a', updatedAt, { version })

  it('pulls when the server has moved on and nothing local is unsent', () => {
    const plan = planSync([mine(100)], [theirs(9, 50)], facts(5, false))
    expect(plan.pull.map((c) => c.id)).toEqual(['a'])
    expect(plan.push).toHaveLength(0)
    expect(plan.conflicts).toHaveLength(0)
  })

  it('pulls even when the local clock claims to be far newer', () => {
    // The exact shape of the bug. A device that re-stamped a stale copy held
    // the newest timestamp in existence and the oldest content, and won. Now
    // the timestamps are not consulted: it is clean and behind, so it pulls.
    const plan = planSync([mine(9_999_999_999)], [theirs(9, 1)], facts(5, false))
    expect(plan.pull.map((c) => c.id)).toEqual(['a'])
    expect(plan.push).toHaveLength(0)
  })

  it('pushes when this device is the only one that moved', () => {
    const plan = planSync([mine(100)], [theirs(5, 900)], facts(5, true))
    expect(plan.push.map((c) => c.id)).toEqual(['a'])
    expect(plan.pull).toHaveLength(0)
    expect(plan.conflicts).toHaveLength(0)
  })

  it('pushes an edit whose clock is behind the server it is based on', () => {
    // A device with a slow clock still owns its unsent edit. Under the old
    // comparison this pulled, and the edit was destroyed.
    const plan = planSync([mine(1)], [theirs(5, 9_999_999_999)], facts(5, true))
    expect(plan.push.map((c) => c.id)).toEqual(['a'])
    expect(plan.pull).toHaveLength(0)
  })

  it('reports a conflict when both moved, and touches neither copy', () => {
    const plan = planSync([mine(500)], [theirs(9, 400)], facts(5, true))
    expect(plan.conflicts).toEqual([{ id: 'a', base: 5, serverVersion: 9 }])
    // The whole point. Nothing is chosen, so nothing is lost.
    expect(plan.pull).toHaveLength(0)
    expect(plan.push).toHaveLength(0)
  })

  it('does nothing when both sides are in step', () => {
    const plan = planSync([mine(100)], [theirs(5, 200)], facts(5, false))
    expect(plan.pull).toHaveLength(0)
    expect(plan.push).toHaveLength(0)
    expect(plan.conflicts).toHaveLength(0)
  })

  it('falls back to the clock only when a fact is missing', () => {
    // Three ways to be half-informed. Each must take the bridge rather than
    // guess: an unknown dirty flag is not "clean", and a missing version is not
    // version zero.
    const noBase = planSync([mine(900)], [theirs(9, 100)], facts(null, false))
    const noDirty = planSync([mine(900)], [theirs(9, 100)], facts(5, null))
    const noVersion = planSync([mine(900)], [campaign('a', 100)], facts(5, false))

    for (const plan of [noBase, noDirty, noVersion]) {
      expect(plan.push.map((c) => c.id)).toEqual(['a'])
      expect(plan.pull).toHaveLength(0)
    }
  })

  it('treats a campaign the account has never seen as adoption, not conflict', () => {
    const plan = planSync([mine(100)], [], facts(null, true))
    expect(plan.push.map((c) => c.id)).toEqual(['a'])
    expect(plan.adopted).toEqual(['a'])
    expect(plan.conflicts).toHaveLength(0)
  })

  it('pulls a campaign this device has never held, whatever it is told', () => {
    const plan = planSync([], [theirs(9, 100)], facts(5, true))
    expect(plan.pull.map((c) => c.id)).toEqual(['a'])
    expect(plan.push).toHaveLength(0)
  })

  it('reads the version and dirtiness per campaign, not once for all of them', () => {
    const plan = planSync(
      [campaign('clean', 100), campaign('edited', 100), campaign('clashing', 100)],
      [
        campaign('clean', 50, { version: 9 }),
        campaign('edited', 50, { version: 5 }),
        campaign('clashing', 50, { version: 9 }),
      ],
      {
        baseOf: () => 5,
        isDirty: (id) => id !== 'clean',
      }
    )
    expect(plan.pull.map((c) => c.id)).toEqual(['clean'])
    expect(plan.push.map((c) => c.id)).toEqual(['edited'])
    expect(plan.conflicts.map((c) => c.id)).toEqual(['clashing'])
  })
})
