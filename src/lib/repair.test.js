import { describe, it, expect } from 'vitest'
import { aftermathDrift, planRepair, repairPatch, describeRepair } from './repair.js'
import { createArsenal, createModel, createEquipment, STARTING_ARSENAL_WEEK } from './shape/arsenal.js'

/**
 * The real loss, transcribed from the documents on the database on
 * 2026-09-08. The payday landed and everything after it did not — which is
 * exactly why a forward replay is the wrong repair: it would pay the 1 scrip a
 * second time.
 */
const madelineRecord = {
  phase: 'determine_injuries',
  done: true,
  scripEarned: 1,
  paid: true,
  barter: {
    flipped: true,
    value: 4,
    suit: 'tome',
    bought: [{ rowId: 'eqp_mtsy5kbj11nuok', equipmentId: 'gatling-gun', name: 'Gatling Gun', cc: 2 }],
  },
  advance: {
    experienceEarned: 3,
    applied: true,
    boxesApplied: 3,
    taken: [
      {
        id: 'adv_mtsy6a1qpuwbna', tier: 1, tableId: 'tactical', name: 'Skill Boost',
        to: 'leader', appliesTo: { name: 'Carry the Flame' },
      },
      { id: 'adv_mtsy6or2v1twxn', tier: 1, tableId: 'attack', name: 'Cruel Lessons', to: 'leader' },
      { id: 'adv_mtsynw6iwh3q61', tier: 2, tableId: 'action', name: 'Balanced Sword', to: 'leader' },
    ],
  },
}

function arsenalWith(over = {}) {
  return createArsenal({
    scrip: 1,
    models: [createModel({ cost: 23, addedWeek: STARTING_ARSENAL_WEEK })],
    startingScripGranted: 0,
    ...over,
  })
}

const campaignWith = (arsenal, aftermath = madelineRecord, week = 1) => ({
  games: [{ id: 'gam_1', arsenalId: arsenal.id, week, aftermath }],
})

describe('aftermathDrift', () => {
  it('finds everything the record claims and the arsenal lacks', () => {
    const a = arsenalWith()
    const d = aftermathDrift(a, campaignWith(a))
    expect(d.advancements.map((x) => x.entry.name)).toEqual(['Skill Boost', 'Cruel Lessons', 'Balanced Sword'])
    expect(d.equipment.map((x) => x.bought.name)).toEqual(['Gatling Gun'])
    expect(d.boxes).toBe(3)
  })

  it('finds nothing once the arsenal already holds it', () => {
    const base = arsenalWith()
    const a = arsenalWith({
      equipment: [createEquipment({ id: 'eqp_mtsy5kbj11nuok' })],
      leader: {
        ...base.leader,
        experience: { boxesChecked: 3 },
        advancements: madelineRecord.advance.taken,
      },
    })
    const d = aftermathDrift(a, campaignWith(a))
    expect(d.advancements).toEqual([])
    expect(d.equipment).toEqual([])
    expect(d.boxes).toBe(0)
  })

  /** Nothing before v0.22.2 has an id, and a name is not an identity. */
  it('skips entries the record cannot identify rather than guessing', () => {
    const a = arsenalWith()
    const legacy = {
      advance: { applied: true, taken: [{ name: 'Skill Boost', to: 'leader' }] },
      barter: { bought: [{ equipmentId: 'coffee', name: 'Coffee', cc: 1 }] },
    }
    const d = aftermathDrift(a, campaignWith(a, legacy))
    expect(d.advancements).toEqual([])
    expect(d.equipment).toEqual([])
  })

  it('reads only this arsenal’s games', () => {
    const a = arsenalWith()
    const d = aftermathDrift(a, { games: [{ id: 'g', arsenalId: 'ars_other', aftermath: madelineRecord }] })
    expect(d.advancements).toEqual([])
  })

  /** A tier-3 totem is the crew gaining a totem, not an advancement to find. */
  it('never looks for a tier-3 totem', () => {
    const a = arsenalWith()
    const record = { advance: { applied: true, taken: [{ id: 'x', tableId: 'totem', name: 'Totem' }] } }
    const d = aftermathDrift(a, campaignWith(a, record))
    expect(d.advancements).toEqual([])
    expect(d.unplaceable).toEqual([])
  })

  /** A totem advancement with no totem is named, not silently dropped. */
  it('reports an advancement it has nowhere to put', () => {
    const a = arsenalWith({ totem: null })
    const record = {
      advance: { applied: true, taken: [{ id: 'x', tableId: 'attack', name: 'Skill Boost', to: 'totem' }] },
    }
    const d = aftermathDrift(a, campaignWith(a, record))
    expect(d.advancements).toEqual([])
    expect(d.unplaceable.map((e) => e.name)).toEqual(['Skill Boost'])
  })
})

describe('planRepair', () => {
  it('describes the whole loss and what it costs', () => {
    const a = arsenalWith()
    const plan = planRepair({ arsenal: a, campaign: campaignWith(a) })
    expect(plan.any).toBe(true)
    expect(plan.scrip).toEqual({ spend: 2, from: 1, to: 0, floored: true })
  })

  /**
   * The purchase was paid for in the record and never deducted, so restoring
   * the row without the spend hands over a free Gatling Gun.
   */
  it('deducts what the record says was spent', () => {
    const a = arsenalWith({ scrip: 6 })
    const plan = planRepair({ arsenal: a, campaign: campaignWith(a) })
    expect(plan.scrip).toEqual({ spend: 2, from: 6, to: 4, floored: false })
  })

  it('is inert when there is nothing to repair', () => {
    const a = arsenalWith()
    expect(planRepair({ arsenal: a, campaign: { games: [] } }).any).toBe(false)
    expect(planRepair({})).toBeNull()
  })

  it('names the things, so the confirmation is answerable', () => {
    const a = arsenalWith()
    const lines = describeRepair(planRepair({ arsenal: a, campaign: campaignWith(a) }))
    expect(lines).toEqual([
      'Skill Boost on Carry the Flame',
      'Cruel Lessons',
      'Balanced Sword',
      'Gatling Gun (2 scrip)',
      '3 experience boxes',
    ])
  })
})

describe('repairPatch', () => {
  it('puts back the equipment under the id the record already named', () => {
    const a = arsenalWith()
    const patch = repairPatch(a, planRepair({ arsenal: a, campaign: campaignWith(a) }))
    expect(patch.equipment).toHaveLength(1)
    expect(patch.equipment[0].id).toBe('eqp_mtsy5kbj11nuok')
    expect(patch.equipment[0].name).toBe('Gatling Gun')
    // Neither is on the record, so both come back off the book.
    expect(patch.equipment[0].page).toBe(24)
    expect(patch.equipment[0].acquiredWeek).toBe(1)
  })

  it('puts back the advancements and the experience boxes', () => {
    const a = arsenalWith()
    const patch = repairPatch(a, planRepair({ arsenal: a, campaign: campaignWith(a) }))
    expect(patch.leader.advancements.map((x) => x.name))
      .toEqual(['Skill Boost', 'Cruel Lessons', 'Balanced Sword'])
    expect(patch.leader.experience.boxesChecked).toBe(3)
    expect(patch.scrip).toBe(0)
  })

  it('appends rather than replacing what the arsenal collected since', () => {
    const base = arsenalWith()
    const a = arsenalWith({
      equipment: [createEquipment({ id: 'eqp_later', name: 'Pistol' })],
      leader: { ...base.leader, advancements: [{ id: 'adv_later', name: 'Later' }] },
    })
    const patch = repairPatch(a, planRepair({ arsenal: a, campaign: campaignWith(a) }))
    expect(patch.equipment.map((e) => e.name)).toEqual(['Pistol', 'Gatling Gun'])
    expect(patch.leader.advancements[0].name).toBe('Later')
  })

  /**
   * The property that makes this safe to offer at all: it is a delta, so the
   * second pass finds nothing missing. `startingScripPatch` works the same way,
   * and for the same reason.
   */
  it('is a no-op the second time, because the delta is recomputed', () => {
    const a = arsenalWith()
    const first = repairPatch(a, planRepair({ arsenal: a, campaign: campaignWith(a) }))
    const repaired = { ...a, ...first }
    const plan = planRepair({ arsenal: repaired, campaign: campaignWith(a) })
    expect(plan.any).toBe(false)
    expect(repairPatch(repaired, plan)).toBeNull()
  })

  /** A forward replay would pay the payday twice; a delta never touches it. */
  it('does not re-apply the phases that did land', () => {
    const a = arsenalWith({ scrip: 1 })
    const patch = repairPatch(a, planRepair({ arsenal: a, campaign: campaignWith(a) }))
    // 1 scrip in hand, minus the 2 the Gatling Gun cost, floored. The payday's
    // +1 is not added again.
    expect(patch.scrip).toBe(0)
  })

  it('routes a crew-card advancement to its own list', () => {
    const a = arsenalWith()
    const record = {
      advance: {
        applied: true,
        taken: [{ id: 'adv_cc', tableId: 'crew-card', name: 'Shape the Landscape', to: 'leader' }],
      },
    }
    const patch = repairPatch(a, planRepair({ arsenal: a, campaign: campaignWith(a, record) }))
    expect(patch.crewCardAdvancements.map((x) => x.name)).toEqual(['Shape the Landscape'])
    expect(patch.leader).toBeUndefined()
  })

  it('is null when there is nothing to do', () => {
    const a = arsenalWith()
    expect(repairPatch(a, planRepair({ arsenal: a, campaign: { games: [] } }))).toBeNull()
  })
})
