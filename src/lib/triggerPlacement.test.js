import { describe, it, expect } from 'vitest'
import { placementProblem, repairReason, advancementsToRepair, movableAdvancements } from './advancement.js'
import { keptTriggerProblem } from './validation.js'
import { outstandingFor } from './outstanding.js'
import { ADVANCEMENT_TABLES } from '../data/advancements.js'
import { createArsenal, createLeader } from './shape/arsenal.js'

/**
 * Triggers and modifiers that are on a card where the book does not allow them
 * (v0.29.0).
 *
 * A player reported a trigger on one of her actions that should not be there,
 * with no way to take it off. Two routes put one there, and both are here:
 *
 *   - a tier-1 advancement on the wrong kind of action — p. 31: the Attack
 *     Modification table on "one attack action", the Tactical table on "one
 *     tactical action";
 *   - a trigger kept at creation by a leader whose archetype does not keep one
 *     (p. 17: only the Heavy Hitter does).
 *
 * The fixtures are built the way real records are — pick keys as `validation.js`
 * mints them, advancements as `PhaseAdvance` records them — because a fixture
 * easier than production has already agreed with a mistake here four times.
 */

const picks = {
  attack: [{ key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', model: 'Skulker Skin', cost: 5, triggers: ['Poison Dart'] }],
  tactical: [{ key: 'aunty-mel::tactical::Life Raft', name: 'Life Raft', model: 'Aunty Mel', cost: 8, triggers: [] }],
  ability: [],
}

const leader = (over = {}) => ({ name: 'Cletus', archetype: 'generalist', picks, advancements: [], trigger: '', ...over })

const attackTrigger = (appliesTo, over = {}) => ({
  id: 'adv_1', tableId: 'attack', tableName: 'Attack Modification',
  name: 'Draw Out Secrets', tableValue: 9, page: 39, appliesTo, ...over,
})

const gained = (id, name, page) => ({ id, tableId: 'action', tableName: 'Action', name, page })

describe('the tier-2 actions carry their kind off the book', () => {
  const actions = ADVANCEMENT_TABLES.find((t) => t.id === 'action').entries.filter((e) => !e.freeChoice)

  it('classifies every named action as attack or tactical', () => {
    for (const a of actions) expect(['attack', 'tactical'], a.name).toContain(a.kind)
    expect(actions.filter((a) => a.kind === 'attack')).toHaveLength(38)
    expect(actions.filter((a) => a.kind === 'tactical')).toHaveLength(35)
  })

  it('agrees with the rule it was read by: a resist makes an attack', () => {
    for (const a of actions) expect(a.kind === 'attack', a.name).toBe(Boolean(a.resistedBy))
  })

  it('matches stat lines checked by hand against pp. 44–49', () => {
    const find = (n) => actions.find((a) => a.name === n)
    expect(find('Balanced Sword')).toMatchObject({ kind: 'attack', stat: 6, resistedBy: 'Df' })
    expect(find('Ice Blast')).toMatchObject({ kind: 'attack', stat: 5, resistedBy: 'Df' })
    expect(find('“Up We Go!”')).toMatchObject({ kind: 'attack', stat: 3, resistedBy: 'Sz' })
    expect(find('Leap')).toMatchObject({ kind: 'tactical', stat: 0, resistedBy: null })
    expect(find('Tap the Leyline')).toMatchObject({ kind: 'tactical', stat: null })
  })
})

describe('placementProblem', () => {
  it('passes an attack trigger on an attack action', () => {
    const adv = attackTrigger({ key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', slot: 'attack' })
    expect(placementProblem(leader({ advancements: [adv] }), adv)).toBeNull()
  })

  it('refuses an attack trigger on a gained tactical action', () => {
    const adv = attackTrigger({ key: 'adv::adv_leap', name: 'Leap', slot: null, gained: true })
    const l = leader({ advancements: [gained('adv_leap', 'Leap', 45), adv] })
    const out = placementProblem(l, adv)
    expect(out.kind).toBe('wrong-kind')
    expect(out.why).toContain('Leap is a tactical action')
    expect(out.why).toContain('p. 31')
  })

  it('refuses a tactical trigger on a gained attack action', () => {
    const adv = attackTrigger(
      { key: 'adv::adv_gun', name: 'Hand Cannon', gained: true },
      { tableId: 'tactical', tableName: 'Tactical Modification', name: 'Fortify', tableValue: 6 },
    )
    const l = leader({ advancements: [gained('adv_gun', 'Hand Cannon', 44), adv] })
    expect(placementProblem(l, adv).kind).toBe('wrong-kind')
  })

  it('refuses one pointed at a pick from the other slot', () => {
    const adv = attackTrigger({ key: 'aunty-mel::tactical::Life Raft', name: 'Life Raft', slot: 'tactical' })
    expect(placementProblem(leader({ advancements: [adv] }), adv).kind).toBe('wrong-kind')
  })

  it('says so when the action it was on is no longer on the leader', () => {
    const adv = attackTrigger({ key: 'somebody::attack::Old Punch', name: 'Old Punch', slot: 'attack' })
    const out = placementProblem(leader({ advancements: [adv] }), adv)
    expect(out.kind).toBe('gone')
    expect(out.why).toContain('attached to nothing')
  })

  it('refuses a written-in target naming the leader’s own action of the other kind', () => {
    // A Lucky Upstart has no tactical slot, so the tactical table falls through
    // to a written field — and the attack action's name was typed in.
    const adv = attackTrigger(
      { key: null, name: ' blowdart ', written: true },
      { tableId: 'tactical', tableName: 'Tactical Modification', name: 'Fortify', tableValue: 6 },
    )
    const l = leader({ picks: { ...picks, tactical: [] }, advancements: [adv] })
    expect(placementProblem(l, adv).kind).toBe('wrong-kind')
  })

  it('takes any other written-in target on trust', () => {
    const adv = attackTrigger({ key: null, name: 'Totem Bite', written: true })
    expect(placementProblem(leader({ advancements: [adv] }), adv)).toBeNull()
  })

  it('does not judge a gained action it cannot classify', () => {
    const adv = attackTrigger({ key: 'adv::adv_x', name: 'Whatever I Named', gained: true })
    const l = leader({ advancements: [gained('adv_x', 'Whatever I Named', 49), adv] })
    expect(placementProblem(l, adv)).toBeNull()
  })

  it('has nothing to say about an unplaced one — that is a different problem', () => {
    expect(placementProblem(leader(), attackTrigger(null))).toBeNull()
  })

  it('ignores tables that have no target at all', () => {
    expect(placementProblem(leader(), gained('adv_leap', 'Leap', 45))).toBeNull()
  })
})

describe('repairing a misplaced advancement', () => {
  it('puts it on the repair list, with the reason', () => {
    const adv = attackTrigger({ key: 'adv::adv_leap', name: 'Leap', gained: true })
    const l = leader({ advancements: [gained('adv_leap', 'Leap', 45), adv] })
    expect(advancementsToRepair(l)).toEqual([adv])
    expect(repairReason(l, adv)).toContain('can only go on an attack action')
  })

  it('takes it off once it is moved somewhere legal', () => {
    const moved = attackTrigger({ key: 'adv::adv_gun', name: 'Hand Cannon', gained: true })
    const l = leader({ advancements: [gained('adv_gun', 'Hand Cannon', 44), moved] })
    expect(advancementsToRepair(l)).toEqual([])
  })
})

describe('keptTriggerProblem — the trigger kept at creation', () => {
  it('is fine for a Heavy Hitter keeping one of its attack action’s triggers', () => {
    expect(keptTriggerProblem(leader({ archetype: 'heavy_hitter', trigger: 'Poison Dart' }))).toBeNull()
  })

  it('refuses any other archetype keeping one', () => {
    const out = keptTriggerProblem(leader({ archetype: 'schemer', trigger: 'Poison Dart' }))
    expect(out.kind).toBe('archetype')
    expect(out.why).toContain('only the Heavy Hitter')
  })

  it('refuses a trigger the attack action does not have', () => {
    const out = keptTriggerProblem(leader({ archetype: 'heavy_hitter', trigger: 'Something Else' }))
    expect(out.kind).toBe('not-on-action')
  })

  it('takes a typed trigger on trust when the pick records none (hand-entered)', () => {
    const handTyped = { ...picks, attack: [{ key: 'manual::X::Punch', name: 'Punch', triggers: [] }] }
    expect(keptTriggerProblem(leader({ archetype: 'heavy_hitter', picks: handTyped, trigger: 'Anything' }))).toBeNull()
  })

  it('says nothing when there is no trigger', () => {
    expect(keptTriggerProblem(leader({ archetype: 'schemer' }))).toBeNull()
  })
})

describe('the outstanding bar reports them where the player is', () => {
  const arsenalWith = (leaderPatch) => createArsenal({
    leader: createLeader({ name: 'Cletus', archetype: 'generalist', picks, ...leaderPatch }),
  })

  it('names a misplaced advancement and a kept trigger in one item', () => {
    const adv = attackTrigger({ key: 'adv::adv_leap', name: 'Leap', gained: true })
    const arsenal = arsenalWith({
      archetype: 'schemer',
      trigger: 'Poison Dart',
      advancements: [gained('adv_leap', 'Leap', 45), adv],
    })
    const item = outstandingFor({ arsenal }).find((i) => i.kind === 'misplaced-triggers')
    expect(item.where).toBe('arsenal')
    expect(item.names).toEqual(['Draw Out Secrets on Leap', 'Poison Dart (kept at creation)'])
    // Not also counted as "does not say which action it changed".
    expect(outstandingFor({ arsenal }).some((i) => i.kind === 'unplaced-advancements')).toBe(false)
  })

  it('says nothing about a healthy leader', () => {
    const adv = attackTrigger({ key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', slot: 'attack' })
    const arsenal = arsenalWith({ advancements: [adv] })
    expect(outstandingFor({ arsenal })).toEqual([])
  })
})

describe('movableAdvancements — a legal placement the player did not mean', () => {
  // The report that asked for it: Reposition, off the Tactical table, on the
  // gained Intuition — legal, so never offered — wanted on Lost in the Hunt.
  const reposition = {
    id: 'adv_r', tableId: 'tactical', tableName: 'Tactical Modification',
    name: 'Reposition', tableValue: 4, page: 41,
    appliesTo: { key: 'adv::adv_int', name: 'Intuition', gained: true },
  }
  const intuition = gained('adv_int', 'Intuition', 48)

  it('offers a legally placed advancement for moving', () => {
    const l = leader({ advancements: [intuition, reposition] })
    expect(advancementsToRepair(l)).toEqual([])
    expect(movableAdvancements(l)).toEqual([reposition])
  })

  it('never offers one twice — a row up for repair is not also movable', () => {
    const adv = attackTrigger({ key: 'adv::adv_leap', name: 'Leap', gained: true })
    const l = leader({ advancements: [gained('adv_leap', 'Leap', 45), adv] })
    expect(movableAdvancements(l)).toEqual([])
  })

  it('ignores unplaced ones and tables with no target', () => {
    const l = leader({ advancements: [intuition, attackTrigger(null)] })
    expect(movableAdvancements(l)).toEqual([])
  })
})
