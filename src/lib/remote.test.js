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
