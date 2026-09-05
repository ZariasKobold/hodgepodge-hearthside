import { describe, it, expect } from 'vitest'
import {
  playablePhases, phasePosition, previousPhase, phasesAfter, phaseHasWork,
  revisionImpact, clearedRecord, unwindArsenal, furthestReached,
} from './rewind.js'
import { createAftermath } from './aftermath.js'

const game = (over = {}) => ({ id: 'g1', arsenalId: 'a1', vp: 3, won: true, ...over })
const forfeited = () => game({ withdrew: true, withdrewOnTurn: 2 })

const ORDER = [
  'draw_hand', 'payday', 'barter', 'advance_leader', 'back_alley_doctor', 'determine_injuries',
]

describe('walking the phases', () => {
  it('lists all six for an ordinary game', () => {
    expect(playablePhases(game()).map((p) => p.id)).toEqual(ORDER)
  })

  it('drops the phases an early withdrawal forfeits', () => {
    expect(playablePhases(forfeited()).map((p) => p.id)).toEqual(['determine_injuries'])
  })

  it('steps backwards over skipped phases rather than onto them', () => {
    // The only playable phase, so there is nothing behind it.
    expect(previousPhase(forfeited(), 'determine_injuries')).toBe(null)
    expect(previousPhase(game(), 'barter')).toBe('payday')
    expect(previousPhase(game(), 'draw_hand')).toBe(null)
  })

  it('knows where a phase sits, and that an unplayed one is nowhere', () => {
    expect(phasePosition(game(), 'barter')).toBe(2)
    expect(phasePosition(forfeited(), 'barter')).toBe(-1)
  })

  it('names every phase after a given one', () => {
    expect(phasesAfter(game(), 'advance_leader').map((p) => p.id))
      .toEqual(['back_alley_doctor', 'determine_injuries'])
    expect(phasesAfter(game(), 'determine_injuries')).toEqual([])
  })
})

describe('which phases have work in them', () => {
  it('reads a blank aftermath as empty throughout', () => {
    const rec = createAftermath()
    for (const id of ORDER) expect(phaseHasWork(rec, id)).toBe(false)
  })

  it('notices a flip with no purchase behind it', () => {
    const rec = createAftermath({ barter: { flipped: true, value: 5, bought: [] } })
    expect(phaseHasWork(rec, 'barter')).toBe(true)
  })

  it('notices collected scrip even when the amount is zero', () => {
    expect(phaseHasWork(createAftermath({ paid: true, scripEarned: 0 }), 'payday')).toBe(true)
  })
})

describe('how far the walk has got', () => {
  it('trusts a stamped value', () => {
    const rec = createAftermath({ phase: 'payday', furthest: 'advance_leader' })
    expect(furthestReached(game(), rec).id).toBe('advance_leader')
  })

  /**
   * THE REGRESSION. Stepping backwards used to redefine how far the player had
   * come, because `furthest` fell back to the *current* phase when unset. The
   * forward button then vanished and the walk became a one-way trip into its
   * own past — reported from production with a Payday reading "Already
   * collected" and nothing able to move.
   */
  it('does not shrink to wherever the player is standing', () => {
    const rec = createAftermath({
      phase: 'payday',
      furthest: 'back_alley_doctor',
      paid: true,
      barter: { flipped: true, value: 3, bought: [] },
    })
    const out = furthestReached(game(), rec)
    expect(out.id).toBe('back_alley_doctor')
    expect(out.index).toBe(4)
  })

  /**
   * Self-healing, and the reason this is derived rather than merely stored: an
   * aftermath already in flight when the feature shipped carries no stamp at
   * all, and a barter flip that exists is proof the barter phase was reached.
   */
  it('recovers a record that was never stamped, from the work in it', () => {
    const rec = createAftermath({
      phase: 'draw_hand',
      paid: true,
      barter: { flipped: true, value: 3, bought: [] },
    })
    expect(rec.furthest).toBeUndefined()
    expect(furthestReached(game(), rec).id).toBe('barter')
  })

  it('counts a locked phase as reached even when it recorded nothing', () => {
    const rec = createAftermath({ phase: 'draw_hand' })
    const out = furthestReached(game(), rec, { locked: ['draw_hand', 'payday', 'barter'] })
    expect(out.id).toBe('barter')
  })

  it('starts at the first phase for a blank aftermath', () => {
    const out = furthestReached(game(), createAftermath())
    expect(out.index).toBe(0)
    expect(out.id).toBe('draw_hand')
  })

  it('ignores a stamp naming a phase this game never plays', () => {
    const rec = createAftermath({ phase: 'determine_injuries', furthest: 'barter' })
    expect(furthestReached(forfeited(), rec).id).toBe('determine_injuries')
  })
})

describe('what a revision would cost, in the player’s words', () => {
  const rec = createAftermath({
    handSize: 3,
    paid: true, scripEarned: 3,
    barter: { flipped: true, value: 4, bought: [{ rowId: 'eqp_1', equipmentId: 'coffee', name: 'Coffee', cc: 1 }] },
    advance: { taken: [{ name: 'Focused', tableId: 'attack' }], applied: true, boxesApplied: 2 },
    doctor: { attempts: [{ injuryId: 'inj_1', injuryName: 'Senseless', outcome: { heals: true, net: 'healed' } }] },
    injuries: { flips: [{ subjectName: 'Rat', result: { attaches: true, name: 'Leadfooted' } }] },
  })

  it('names the actual things, not a count', () => {
    const impact = revisionImpact(game(), rec, 'payday')
    const flat = impact.phases.flatMap((p) => p.items)
    expect(flat).toContain('Coffee — bought, 1 scrip back')
    expect(flat).toContain('Focused (attack)')
    expect(flat).toContain('Rat — Leadfooted')
  })

  it('counts the phase being revised and everything after it', () => {
    const early = revisionImpact(game(), rec, 'draw_hand')
    const late = revisionImpact(game(), rec, 'back_alley_doctor')
    expect(early.count).toBeGreaterThan(late.count)
    expect(late.phases.map((p) => p.id)).toEqual(['back_alley_doctor', 'determine_injuries'])
  })

  /**
   * The phase itself is in scope, and it has to be. Leaving Payday's scrip in
   * the purse while "revising" it gives a screen that says "Already collected"
   * with no way to change the figure — a read-only view wearing an edit button.
   */
  it('includes the phase being revised, not only what follows', () => {
    const impact = revisionImpact(game(), rec, 'payday')
    expect(impact.phases[0].id).toBe('payday')
    expect(impact.phases[0].items).toContain('3 scrip collected')
  })

  it('reports nothing to lose when nothing has been recorded from here on', () => {
    const impact = revisionImpact(game(), createAftermath(), 'draw_hand')
    expect(impact.any).toBe(false)
    expect(impact.count).toBe(0)
  })

  it('still has something to say about the last phase when it has work', () => {
    const impact = revisionImpact(game(), rec, 'determine_injuries')
    expect(impact.phases.map((p) => p.id)).toEqual(['determine_injuries'])
  })
})

describe('clearing the record', () => {
  it('blanks the named phases and leaves the rest alone', () => {
    const rec = createAftermath({
      handSize: 4, paid: true, scripEarned: 3,
      barter: { flipped: true, value: 4, bought: [{ equipmentId: 'coffee' }] },
    })
    const next = clearedRecord(rec, ['barter'])

    expect(next.barter.bought).toEqual([])
    expect(next.barter.flipped).toBe(false)
    expect(next.handSize).toBe(4)
    expect(next.paid).toBe(true)
  })

  it('does not decide where the player ends up', () => {
    const rec = createAftermath({ phase: 'determine_injuries' })
    expect(clearedRecord(rec, ['barter']).phase).toBe('determine_injuries')
  })
})

/* ── the arsenal half ───────────────────────────────────────────── */

const arsenal = (over = {}) => ({
  id: 'a1', scrip: 5, equipment: [], injuries: [], models: [],
  leader: { name: 'Vex', advancements: [], experience: { boxesChecked: 0 } },
  totem: null, crewCardAdvancements: [], ...over,
})

describe('unwinding the arsenal', () => {
  it('refunds a purchase and takes the equipment back off the shelf', () => {
    const a = arsenal({
      scrip: 4,
      equipment: [{ id: 'eqp_1', equipmentId: 'coffee', name: 'Coffee', cc: 1 }],
    })
    const rec = createAftermath({
      barter: { flipped: true, bought: [{ rowId: 'eqp_1', equipmentId: 'coffee', cc: 1 }] },
    })
    const out = unwindArsenal(a, rec, ['barter'], { order: ORDER })

    expect(out.equipment).toEqual([])
    expect(out.scrip).toBe(5)
  })

  it('removes one copy when two of the same thing were bought', () => {
    const a = arsenal({
      scrip: 0,
      equipment: [
        { id: 'eqp_1', equipmentId: 'coffee', cc: 1 },
        { id: 'eqp_2', equipmentId: 'coffee', cc: 1 },
      ],
    })
    // An older record with no row ids — the fallback path.
    const rec = createAftermath({ barter: { flipped: true, bought: ['coffee'] } })
    const out = unwindArsenal(a, rec, ['barter'], { order: ORDER })

    expect(out.equipment.map((e) => e.id)).toEqual(['eqp_1'])
    expect(out.scrip).toBe(1)
  })

  it('un-heals an injury the doctor removed, and gives the scrip back', () => {
    const a = arsenal({
      scrip: 2,
      injuries: [{ id: 'inj_1', name: 'Senseless', removedAt: 12345 }],
    })
    const rec = createAftermath({
      doctor: { attempts: [{ injuryId: 'inj_1', outcome: { heals: true, net: 'healed' } }] },
    })
    const out = unwindArsenal(a, rec, ['back_alley_doctor'], { order: ORDER })

    expect(out.injuries[0].removedAt).toBe(null)
    expect(out.scrip).toBe(3)
  })

  it('refunds a failed attempt too — the doctor keeps the scrip either way', () => {
    const a = arsenal({ scrip: 0, injuries: [{ id: 'inj_1', name: 'Senseless', removedAt: null }] })
    const rec = createAftermath({
      doctor: { attempts: [{ injuryId: 'inj_1', outcome: { heals: false, net: 'nothing' } }] },
    })
    expect(unwindArsenal(a, rec, ['back_alley_doctor'], { order: ORDER }).scrip).toBe(1)
  })

  it('detaches an injury phase six attached', () => {
    const a = arsenal({ injuries: [{ id: 'inj_9', name: 'Leadfooted', modelId: 'm1' }] })
    const rec = createAftermath({
      injuries: { flips: [{ rowId: 'inj_9', modelId: 'm1', result: { attaches: true, name: 'Leadfooted' } }] },
    })
    expect(unwindArsenal(a, rec, ['determine_injuries'], { order: ORDER }).injuries).toEqual([])
  })

  it('brings back a model annihilated by the injuries it is undoing', () => {
    const a = arsenal({ models: [{ id: 'm1', name: 'Rat', annihilated: true }] })
    const rec = createAftermath({
      injuries: { flips: [] },
      annihilated: ['m1'],
    })
    const out = unwindArsenal(a, rec, ['determine_injuries'], { order: ORDER })
    expect(out.models[0].annihilated).toBe(false)
  })

  it('takes back an advancement and the boxes that bought it', () => {
    const a = arsenal({
      leader: { name: 'Vex', advancements: [{ name: 'Focused' }], experience: { boxesChecked: 3 } },
    })
    const rec = createAftermath({
      advance: { taken: [{ name: 'Focused', tableId: 'attack' }], applied: true, boxesApplied: 2 },
    })
    const out = unwindArsenal(a, rec, ['advance_leader'], { order: ORDER })

    expect(out.leader.advancements).toEqual([])
    expect(out.leader.experience.boxesChecked).toBe(1)
  })

  it('removes a totem that came off the tier-3 table', () => {
    const a = arsenal({ totem: { name: 'Wisp', advancements: [] } })
    const rec = createAftermath({
      advance: { taken: [{ name: 'Wisp', tableId: 'totem' }], applied: true, boxesApplied: 1 },
    })
    expect(unwindArsenal(a, rec, ['advance_leader'], { order: ORDER }).totem).toBe(null)
  })

  it('never checks off a negative number of boxes', () => {
    const a = arsenal({ leader: { name: 'Vex', advancements: [], experience: { boxesChecked: 1 } } })
    const rec = createAftermath({ advance: { taken: [], applied: true, boxesApplied: 4 } })
    expect(unwindArsenal(a, rec, ['advance_leader'], { order: ORDER }).leader.experience.boxesChecked).toBe(0)
  })

  /**
   * The ordering rule this module exists to get right. Payday earned 3 and
   * barter spent 1. Unwinding both must land on the original 2: refund first
   * (→ 5), then take back the payday (→ 2). Reversing payday first would floor
   * at 0 and the refund would vanish.
   */
  it('refunds before it takes the payday back', () => {
    const a = arsenal({
      scrip: 4, // 2 to start, +3 payday, -1 coffee
      equipment: [{ id: 'eqp_1', equipmentId: 'coffee', cc: 1 }],
    })
    const rec = createAftermath({
      paid: true, scripEarned: 3,
      barter: { flipped: true, bought: [{ rowId: 'eqp_1', equipmentId: 'coffee', cc: 1 }] },
    })
    const out = unwindArsenal(a, rec, ['payday', 'barter'], { order: ORDER })

    expect(out.scrip).toBe(2)
    expect(out.equipment).toEqual([])
  })

  it('is the same whichever order the phases are handed over in', () => {
    const a = arsenal({ scrip: 4, equipment: [{ id: 'eqp_1', equipmentId: 'coffee', cc: 1 }] })
    const rec = createAftermath({
      paid: true, scripEarned: 3,
      barter: { flipped: true, bought: [{ rowId: 'eqp_1', equipmentId: 'coffee', cc: 1 }] },
    })
    const forwards = unwindArsenal(a, rec, ['payday', 'barter'], { order: ORDER })
    const backwards = unwindArsenal(a, rec, ['barter', 'payday'], { order: ORDER })
    expect(forwards).toEqual(backwards)
  })

  it('leaves an arsenal alone when the phases it is given are empty', () => {
    const a = arsenal({ scrip: 7 })
    const out = unwindArsenal(a, createAftermath(), ORDER, { order: ORDER })
    expect(out.scrip).toBe(7)
    expect(out.equipment).toEqual([])
    expect(out.injuries).toEqual([])
  })

  it('does not mutate what it was given', () => {
    const a = arsenal({ scrip: 4, equipment: [{ id: 'eqp_1', equipmentId: 'coffee', cc: 1 }] })
    const snapshot = JSON.parse(JSON.stringify(a))
    const rec = createAftermath({
      paid: true, scripEarned: 3,
      barter: { flipped: true, bought: [{ rowId: 'eqp_1', equipmentId: 'coffee', cc: 1 }] },
    })
    unwindArsenal(a, rec, ['payday', 'barter'], { order: ORDER })
    expect(a).toEqual(snapshot)
  })
})
