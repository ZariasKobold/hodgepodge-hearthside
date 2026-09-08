import { describe, it, expect } from 'vitest'
import { outstandingFor, outstandingAcross } from './outstanding.js'
import {
  createArsenal, createModel, createEquipment, STARTING_ARSENAL_WEEK,
} from './shape/arsenal.js'

/** An arsenal whose starting spend is exactly 25, so nothing is owed by p. 15. */
function built(patch = {}) {
  return createArsenal({
    models: [createModel({ cost: 25, addedWeek: STARTING_ARSENAL_WEEK })],
    startingScripGranted: 0,
    ...patch,
  })
}

/** A campaign holding one game whose aftermath record is `aftermath`. */
function withGame(arsenal, aftermath) {
  return { games: [{ id: 'gam_1', arsenalId: arsenal.id, aftermath }] }
}

describe('outstandingFor', () => {
  it('is empty for an arsenal with nothing owed and nothing recorded', () => {
    expect(outstandingFor({ arsenal: built(), campaign: { games: [] } })).toEqual([])
  })

  it('is empty rather than throwing when there is no arsenal', () => {
    expect(outstandingFor()).toEqual([])
    expect(outstandingFor({ arsenal: null })).toEqual([])
  })
})

describe('the starting scrip', () => {
  it('is reported when p. 15 was never paid', () => {
    const arsenal = built({
      models: [createModel({ cost: 22, addedWeek: STARTING_ARSENAL_WEEK })],
      startingScripGranted: null,
    })
    const [item] = outstandingFor({ arsenal })
    expect(item.kind).toBe('starting-scrip')
    expect(item.count).toBe(3)
    expect(item.where).toBe('creation')
  })

  it('goes quiet once it has been paid', () => {
    const arsenal = built({
      models: [createModel({ cost: 22, addedWeek: STARTING_ARSENAL_WEEK })],
      startingScripGranted: 3,
    })
    expect(outstandingFor({ arsenal })).toEqual([])
  })

  /**
   * The grant is reconciled against the *starting* arsenal, so a leader who
   * spent all 25 is owed nothing however many weekly hires follow.
   */
  it('is not reported for an arsenal that spent all 25', () => {
    const arsenal = built({ startingScripGranted: null })
    expect(outstandingFor({ arsenal })).toEqual([])
  })

  /**
   * Found in the browser, as the first thing on the screen: a brand-new
   * arsenal has all 25 soulstones unspent and has never been reconciled, so
   * the raw selector says it is owed 3. Saying so would greet every new player
   * with a claim about a leader they have not built yet.
   */
  it('says nothing about an arsenal nobody has started building', () => {
    expect(outstandingFor({ arsenal: createArsenal() })).toEqual([])
    expect(outstandingFor({ arsenal: createArsenal({ models: [] }) })).toEqual([])
  })
})

describe('aftermath drift', () => {
  /**
   * The real case, transcribed from the arsenal and campaign documents that
   * were on the database on 2026-09-08. The aftermath was walked across two
   * sittings six days apart: the payday reached the arsenal, and the barter
   * and all three advancements reached only the game record.
   *
   * Written out as production had it rather than as a tidy fixture — the
   * advancements carry ids and `appliesTo`, `applied` is true, and the boxes
   * were claimed — because the v0.22.4 lesson is that a fixture easier than
   * production proves nothing.
   */
  const madelineRecord = {
    phase: 'determine_injuries',
    done: true,
    scripEarned: 1,
    paid: true,
    barter: {
      flipped: true,
      bought: [{ rowId: 'eqp_mtsy5kbj11nuok', equipmentId: 'gatling-gun', name: 'Gatling Gun', cc: 2 }],
    },
    advance: {
      experienceEarned: 3,
      applied: true,
      boxesApplied: 3,
      taken: [
        { id: 'adv_mtsy6a1qpuwbna', tableId: 'tactical', name: 'Skill Boost', to: 'leader' },
        { id: 'adv_mtsy6or2v1twxn', tableId: 'attack', name: 'Cruel Lessons', to: 'leader' },
        { id: 'adv_mtsynw6iwh3q61', tableId: 'action', name: 'Balanced Sword', to: 'leader' },
      ],
    },
  }

  it('reports a whole aftermath that never reached the arsenal', () => {
    const arsenal = built({ startingScripGranted: 0 })
    const [item] = outstandingFor({ arsenal, campaign: withGame(arsenal, madelineRecord) })

    expect(item.kind).toBe('aftermath-drift')
    expect(item.severity).toBe('high')
    // three advancements, one equipment row, three experience boxes
    expect(item.count).toBe(7)
    // Named, never counted — "3 items" is not something a player can check
    // against their own table.
    expect(item.detail).toContain('Skill Boost, Cruel Lessons and Balanced Sword')
    expect(item.detail).toContain('Gatling Gun from the barter')
    expect(item.detail).toContain('3 experience boxes')
  })

  it('goes quiet once the same record has been applied', () => {
    const arsenal = built({
      startingScripGranted: 0,
      equipment: [createEquipment({ id: 'eqp_mtsy5kbj11nuok', name: 'Gatling Gun' })],
      leader: {
        ...built().leader,
        experience: { boxesChecked: 3 },
        advancements: madelineRecord.advance.taken.map((t) => ({ ...t, appliesTo: { name: 'x' } })),
      },
    })
    expect(outstandingFor({ arsenal, campaign: withGame(arsenal, madelineRecord) })).toEqual([])
  })

  /**
   * Matching is by id, and an id-less entry is skipped rather than guessed at.
   * Everything recorded before v0.22.2 is id-less; reporting those as missing
   * would light the bar permanently for every older campaign.
   */
  it('says nothing about entries recorded before ids existed', () => {
    const arsenal = built({ startingScripGranted: 0 })
    const legacy = {
      advance: { applied: true, taken: [{ tableId: 'attack', name: 'Skill Boost', to: 'leader' }] },
      barter: { bought: [{ equipmentId: 'coffee', name: 'Coffee', cc: 1 }] },
    }
    expect(outstandingFor({ arsenal, campaign: withGame(arsenal, legacy) })).toEqual([])
  })

  /** A tier-3 totem is the crew gaining a totem, not an advancement to find. */
  it('does not look for a totem taken off the tier-3 table', () => {
    const arsenal = built({ startingScripGranted: 0 })
    const record = {
      advance: { applied: true, taken: [{ id: 'adv_t', tableId: 'totem', name: 'Totem', to: 'leader' }] },
    }
    expect(outstandingFor({ arsenal, campaign: withGame(arsenal, record) })).toEqual([])
  })

  /**
   * An advancement that went to the totem counts as held when the totem has
   * it — the search has to look in all three places the aftermath writes.
   *
   * It is still reported as needing a target, and that is correct: a tier-1
   * row modifies one chosen action whoever holds it. Only the drift claim is
   * under test here.
   */
  it('finds an advancement on the totem it was applied to', () => {
    const entry = { id: 'adv_x', tableId: 'attack', name: 'Skill Boost', to: 'totem' }
    const arsenal = built({
      startingScripGranted: 0,
      totem: { name: 'Totem', advancements: [entry] },
    })
    const record = { advance: { applied: true, taken: [entry] } }
    const kinds = outstandingFor({ arsenal, campaign: withGame(arsenal, record) }).map((i) => i.kind)
    expect(kinds).not.toContain('aftermath-drift')
  })

  /**
   * One-sided on purpose. `boxesChecked` accumulates across every game ever
   * played while `boxesApplied` only exists since v0.22.0, so a track holding
   * more than the records claim is ordinary history, not drift.
   */
  it('does not report a track holding more boxes than the records claim', () => {
    const base = built()
    const arsenal = built({
      startingScripGranted: 0,
      leader: { ...base.leader, experience: { boxesChecked: 9 } },
    })
    const record = { advance: { applied: true, boxesApplied: 2, taken: [] } }
    expect(outstandingFor({ arsenal, campaign: withGame(arsenal, record) })).toEqual([])
  })

  it('ignores boxes from a phase that was never applied', () => {
    const arsenal = built({ startingScripGranted: 0 })
    const record = { advance: { applied: false, boxesApplied: 3, taken: [] } }
    expect(outstandingFor({ arsenal, campaign: withGame(arsenal, record) })).toEqual([])
  })

  /** Another leader's game at the same table is not this leader's business. */
  it('reads only the records belonging to this arsenal', () => {
    const arsenal = built({ startingScripGranted: 0 })
    const campaign = {
      games: [{ id: 'g', arsenalId: 'ars_someone_else', aftermath: madelineRecord }],
    }
    expect(outstandingFor({ arsenal, campaign })).toEqual([])
  })
})

describe('unplaced advancements', () => {
  it('reports a tier-1 advancement with no target', () => {
    const base = built()
    const arsenal = built({
      startingScripGranted: 0,
      leader: {
        ...base.leader,
        advancements: [{ id: 'adv_1', tableId: 'attack', name: 'Skill Boost', to: 'leader' }],
      },
    })
    const items = outstandingFor({ arsenal })
    const item = items.find((i) => i.kind === 'unplaced-advancements')
    expect(item.count).toBe(1)
    expect(item.where).toBe('arsenal')
    expect(item.title).toContain('does not say')
  })

  it('goes quiet once the target is named', () => {
    const base = built()
    const arsenal = built({
      startingScripGranted: 0,
      leader: {
        ...base.leader,
        advancements: [{
          id: 'adv_1', tableId: 'attack', name: 'Cruel Lessons', to: 'leader',
          appliesTo: { key: 'k', name: 'Breath of Fire' },
        }],
      },
    })
    expect(outstandingFor({ arsenal })).toEqual([])
  })
})

describe('ordering', () => {
  it('puts drift above the repairs, because it is the one that lost something', () => {
    const base = built()
    const arsenal = built({
      startingScripGranted: null,
      models: [createModel({ cost: 22, addedWeek: STARTING_ARSENAL_WEEK })],
      leader: {
        ...base.leader,
        advancements: [{ id: 'adv_1', tableId: 'attack', name: 'Skill Boost', to: 'leader' }],
      },
    })
    const record = {
      advance: {
        applied: true,
        boxesApplied: 0,
        taken: [{ id: 'adv_missing', tableId: 'attack', name: 'Cruel Lessons', to: 'leader' }],
      },
    }
    const kinds = outstandingFor({ arsenal, campaign: withGame(arsenal, record) }).map((i) => i.kind)
    expect(kinds).toEqual(['aftermath-drift', 'starting-scrip', 'unplaced-advancements'])
  })
})

describe('outstandingAcross', () => {
  /**
   * The player this was written for has two leaders and both are owed scrip.
   * Reporting only the open one would repeat the failure the module exists to
   * end — you would have to already be looking at the thing to be told.
   */
  it('groups every arsenal on the shelf that has something outstanding', () => {
    const owed = built({
      models: [createModel({ cost: 23, addedWeek: STARTING_ARSENAL_WEEK })],
      startingScripGranted: null,
    })
    const settled = built()
    const groups = outstandingAcross([
      { arsenal: owed, campaign: { games: [] } },
      { arsenal: settled, campaign: { games: [] } },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].arsenal.id).toBe(owed.id)
    expect(groups[0].items[0].count).toBe(2)
  })

  it('is empty for an empty shelf', () => {
    expect(outstandingAcross()).toEqual([])
    expect(outstandingAcross([])).toEqual([])
  })
})
