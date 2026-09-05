import { describe, it, expect } from 'vitest'
import {
  needsTarget, targetsFor, advancementsOn, advancedAction, rowFor,
  gainedActions, gainedActionKey, advancementsToRepair, rowIsGuessed, ambiguousRows, rowsNamed,
} from './advancement.js'
import { findTable } from '../data/advancements.js'

const attack = findTable('attack')
const tactical = findTable('tactical')

const row = (table, name, value) =>
  table.entries.find((e) => e.name === name && e.value === value)

/** Blowdart, as the register returns it — the action from the screenshot. */
const blowdart = { name: 'Blowdart', stat: 5, resistedBy: 'Df', damage: 2, triggers: [] }
const lifeRaft = { name: 'Life Raft', stat: 0, targetNumber: 6, triggers: [] }

const leader = (over = {}) => ({
  name: 'Cletus and Duke Carcinus',
  picks: {
    attack: [{ key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', model: 'Skulker Skin', cost: 5 }],
    tactical: [{ key: 'aunty-mel::tactical::Life Raft', name: 'Life Raft', model: 'Aunty Mel', cost: 8 }],
    ability: [],
  },
  advancements: [],
  ...over,
})

const took = (over = {}) => ({
  id: 'adv_1',
  tableId: 'attack',
  tableName: 'Attack Modification',
  name: 'Draw Out Secrets',
  tableValue: 9,
  page: 39,
  appliesTo: { key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', slot: 'attack' },
  ...over,
})

describe('which tables need a target', () => {
  it('asks for one on both tier-1 tables', () => {
    expect(needsTarget(attack)).toBe(true)
    expect(needsTarget(tactical)).toBe(true)
  })

  it('asks for none on the tables that grant something new', () => {
    for (const id of ['action', 'ability', 'totem', 'summoning', 'crew-card']) {
      expect(needsTarget(findTable(id))).toBe(false)
    }
    expect(needsTarget(null)).toBe(false)
  })
})

describe('resolving a row', () => {
  /* "Skill Boost" is printed three times on the attack table and the three
     change the Skl to three different numbers, so a name alone is not a row. */
  it('tells the three Skill Boosts apart by their flip value', () => {
    expect(rowFor({ tableId: 'attack', name: 'Skill Boost', tableValue: 7 }).statTo).toBe(5)
    expect(rowFor({ tableId: 'attack', name: 'Skill Boost', tableValue: 10 }).statTo).toBe(6)
    expect(rowFor({ tableId: 'attack', name: 'Skill Boost', tableValue: 12 }).statTo).toBe(7)
  })

  it('refuses to guess when an old record names an ambiguous row', () => {
    expect(rowFor({ tableId: 'attack', name: 'Skill Boost' })).toBeNull()
  })

  it('still resolves an unambiguous name with no flip value recorded', () => {
    expect(rowFor({ tableId: 'attack', name: 'Draw Out Secrets' })?.page).toBe(39)
  })

  it('returns null for a table or a name it does not know', () => {
    expect(rowFor({ tableId: 'nope', name: 'Draw Out Secrets' })).toBeNull()
    expect(rowFor({ tableId: 'attack', name: 'Not A Row' })).toBeNull()
    expect(rowFor(null)).toBeNull()
  })
})

describe('offering the actions an advancement may go on', () => {
  const actionFor = (t) => (t.name === 'Blowdart' ? blowdart : t.name === 'Life Raft' ? lifeRaft : null)

  it('offers the leader’s attack actions for an attack modification', () => {
    const out = targetsFor(leader(), attack, row(attack, 'Draw Out Secrets', 9), actionFor)
    expect(out.map((t) => t.name)).toEqual(['Blowdart'])
    expect(out[0].eligible).toBe(true)
  })

  it('offers the tactical actions for a tactical modification', () => {
    const out = targetsFor(leader(), tactical, row(tactical, 'Without Warning', 7), actionFor)
    expect(out.map((t) => t.name)).toEqual(['Life Raft'])
  })

  it('returns nothing at all for a table with no target', () => {
    expect(targetsFor(leader(), findTable('ability'), null, actionFor)).toEqual([])
  })

  /* The Skl 5 → 6 boost is the one the screenshot's leader qualifies for. */
  it('accepts a Skl modifier whose from-value matches the action', () => {
    const out = targetsFor(leader(), attack, row(attack, 'Skill Boost', 10), actionFor)
    expect(out[0].eligible).toBe(true)
  })

  it('refuses a Skl modifier whose from-value does not match, and says why', () => {
    const out = targetsFor(leader(), attack, row(attack, 'Skill Boost', 7), actionFor)
    expect(out[0].eligible).toBe(false)
    expect(out[0].why).toContain('Skl 5')
    expect(out[0].why).toContain('needs 4')
  })

  it('refuses a Skl modifier on an action that resists nothing', () => {
    const scheme = { name: 'Blowdart', stat: 5, resistedBy: null }
    const out = targetsFor(leader(), attack, row(attack, 'Skill Boost', 10), () => scheme)
    expect(out[0].eligible).toBe(false)
    expect(out[0].why).toContain('needs Df or Wp')
  })

  it('does not apply the resist condition to the tactical table', () => {
    const out = targetsFor(leader(), tactical, row(tactical, 'Skill Boost', 7), actionFor)
    expect(out[0].eligible).toBe(true)
  })

  /* §6 — everything degrades. A register outage must not hide an action. */
  it('offers an action it cannot read, marked unknown rather than dropped', () => {
    const out = targetsFor(leader(), attack, row(attack, 'Skill Boost', 10), () => null)
    expect(out).toHaveLength(1)
    expect(out[0].eligible).toBeNull()
    expect(out[0].why).toContain('register')
  })

  it('is happy to place a trigger without the register at all', () => {
    const out = targetsFor(leader(), attack, row(attack, 'Draw Out Secrets', 9), () => null)
    expect(out[0].eligible).toBe(true)
  })

  /**
   * THE ORDERING CASE. A leader who took the Skl 4→5 boost holds an action the
   * register still calls Skl 4, so judging the 5→6 boost against the register's
   * copy would refuse an advancement the leader is entitled to. Over twelve
   * weeks this is the ordinary case, not the exotic one.
   */
  it('judges a Skl row against the action as earlier advancements left it', () => {
    const four = { ...blowdart, stat: 4 }
    const l = leader({
      advancements: [took({
        id: 'adv_0', name: 'Skill Boost', tableValue: 7,
        appliesTo: { key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', slot: 'attack' },
      })],
    })
    // Raw, the register says Skl 4 — so the 4→5 row would look legal again.
    expect(targetsFor(l, attack, row(attack, 'Skill Boost', 7), () => four)[0].eligible).toBe(false)
    // Advanced, it is Skl 5, which is what the next boost up needs.
    expect(targetsFor(l, attack, row(attack, 'Skill Boost', 10), () => four)[0].eligible).toBe(true)
  })

  it('knows the Skl of a gained action that has already been boosted', () => {
    const l = leader({
      advancements: [
        { id: 'adv_9', tableId: 'action', name: 'Hand Cannon', page: 44 },
        took({
          id: 'adv_a', name: 'Skill Boost', tableValue: 7,
          appliesTo: { key: 'adv::adv_9', name: 'Hand Cannon', slot: 'attack', gained: true },
        }),
      ],
    })
    const gained = targetsFor(l, attack, row(attack, 'Skill Boost', 10), () => null)[1]
    // Skl 5 now, which the 5→6 row wants — but the resist is only on the card,
    // so this stays an unknown rather than becoming a yes.
    expect(gained.eligible).toBeNull()
    expect(gained.why).toContain('resists')
  })

  it('will not clear a resist condition it cannot read, even knowing the Skl', () => {
    const l = leader({
      advancements: [took({
        id: 'adv_0', name: 'Skill Boost', tableValue: 7,
        appliesTo: { key: 'skulker-skin::attack::Blowdart', name: 'Blowdart', slot: 'attack' },
      })],
    })
    const out = targetsFor(l, attack, row(attack, 'Skill Boost', 10), () => null)[0]
    expect(out.eligible).toBeNull()
  })

  it('has no verdict before a row is chosen', () => {
    const out = targetsFor(leader(), attack, null, actionFor)
    expect(out[0].eligible).toBeNull()
  })

  it('includes actions gained from the tier-2 table, unclassified', () => {
    const l = leader({
      advancements: [{ id: 'adv_9', tableId: 'action', name: 'Hand Cannon', page: 44 }],
    })
    const out = targetsFor(l, attack, row(attack, 'Draw Out Secrets', 9), actionFor)
    expect(out.map((t) => t.name)).toEqual(['Blowdart', 'Hand Cannon'])
    const gained = out[1]
    expect(gained.gained).toBe(true)
    expect(gained.eligible).toBeNull()
    expect(gained.key).toBe('adv::adv_9')
  })

  it('does not offer abilities or totems as gained actions', () => {
    const l = leader({
      advancements: [
        { id: 'a', tableId: 'ability', name: 'Stealth' },
        { id: 'b', tableId: 'totem', name: 'Cursemonger' },
      ],
    })
    expect(gainedActions(l)).toEqual([])
  })

  it('falls back to the name for a gained action recorded before ids', () => {
    expect(gainedActionKey({ name: 'Hand Cannon' })).toBe('adv::Hand Cannon')
  })
})

describe('reading the advancements off one action', () => {
  it('finds the ones pointed at that key and no others', () => {
    const l = leader({
      advancements: [
        took(),
        took({ id: 'adv_2', appliesTo: { key: 'other', name: 'Life Raft', slot: 'tactical' } }),
        took({ id: 'adv_3', appliesTo: null, tableId: 'ability', name: 'Stealth' }),
      ],
    })
    expect(advancementsOn(l, 'skulker-skin::attack::Blowdart').map((a) => a.id)).toEqual(['adv_1'])
  })

  it('finds nothing for a missing key', () => {
    expect(advancementsOn(leader({ advancements: [took()] }), '')).toEqual([])
    expect(advancementsOn(null, 'anything')).toEqual([])
  })
})

describe('the action as the advancements leave it', () => {
  /* The screenshot's case, end to end: Blowdart, boosted to 6, with the
     trigger the player took at 9. */
  it('raises the Skl and hangs the trigger off the same action', () => {
    const out = advancedAction(blowdart, [
      took({ id: 'adv_1', name: 'Skill Boost', tableValue: 10, page: 40 }),
      took({ id: 'adv_2', name: 'Draw Out Secrets', tableValue: 9, page: 39 }),
    ])
    expect(out.action.stat).toBe(6)
    expect(out.statChanged).toBe(true)
    expect(out.triggers).toEqual([{ name: 'Draw Out Secrets', suit: 'tome', page: 39 }])
  })

  it('leaves an unadvanced action exactly as it was', () => {
    const out = advancedAction(blowdart, [])
    expect(out.action).toEqual(blowdart)
    expect(out.statChanged).toBe(false)
    expect(out.madeSignature).toBe(false)
    expect(out.triggers).toEqual([])
  })

  it('does not mutate the action it was given', () => {
    advancedAction(blowdart, [took({ name: 'Skill Boost', tableValue: 10 })])
    expect(blowdart.stat).toBe(5)
  })

  it('makes a signature action out of the tier-1 thirteen', () => {
    const out = advancedAction(blowdart, [took({ name: 'Attack Signature', tableValue: 13, page: 40 })])
    expect(out.action.isSignature).toBe(true)
    expect(out.madeSignature).toBe(true)
    expect(out.triggers).toEqual([])
  })

  /* `statTo` is absolute, so the answer survives the register being down. */
  it('still knows the final Skl with no action to read', () => {
    const out = advancedAction(null, [took({ name: 'Skill Boost', tableValue: 10 })])
    expect(out.action).toBeNull()
    expect(out.stat).toBe(6)
    expect(out.statChanged).toBe(true)
  })

  it('applies two boosts in the order they were taken', () => {
    const out = advancedAction({ ...blowdart, stat: 4 }, [
      took({ name: 'Skill Boost', tableValue: 7 }),
      took({ name: 'Skill Boost', tableValue: 10 }),
    ])
    expect(out.action.stat).toBe(6)
  })

  it('treats a row it cannot resolve as a trigger rather than dropping it', () => {
    const out = advancedAction(blowdart, [took({ name: 'Something Errataed', tableValue: 99 })])
    expect(out.triggers).toEqual([{ name: 'Something Errataed', suit: null, page: 39 }])
    expect(out.action.stat).toBe(5)
  })
})

describe('advancements the repair panel has to offer', () => {
  const legacy = (over = {}) => ({
    tableId: 'attack', tableName: 'Attack Modification',
    name: 'Draw Out Secrets', tableValue: 9, page: 39, ...over,
  })
  const boost = (over = {}) => legacy({ name: 'Skill Boost', tableValue: 7, page: 39, ...over })
  const placed = { key: 'k', name: 'Blowdart', slot: 'attack' }

  it('offers the tier-1 ones with no target', () => {
    const l = leader({ advancements: [legacy(), boost()] })
    expect(advancementsToRepair(l).map((a) => a.name)).toEqual(['Draw Out Secrets', 'Skill Boost'])
  })

  it('leaves alone anything that never had a target to give', () => {
    const l = leader({
      advancements: [
        { id: 'a', tableId: 'action', name: 'Hand Cannon' },
        { id: 'b', tableId: 'ability', name: 'Stealth' },
        { id: 'c', tableId: 'summoning', name: 'Rally Point' },
        { id: 'd', tableId: 'crew-card', name: "Grave's Pull" },
      ],
    })
    expect(advancementsToRepair(l)).toEqual([])
  })

  it('drops an unambiguous one once it has been given a target', () => {
    expect(advancementsToRepair(leader({ advancements: [legacy({ appliesTo: placed })] }))).toEqual([])
  })

  /* A hand-written name is an answer, not a gap. */
  it('counts a hand-written target as placed', () => {
    const written = { key: null, name: 'Whatever It Was', slot: 'attack', written: true }
    expect(advancementsToRepair(leader({ advancements: [legacy({ appliesTo: written })] }))).toEqual([])
  })

  /**
   * THE SECOND DEAD END. Placing a Skill Boost took it off the list while its
   * *row* was still the wrong one of three, so the sheet went on reading Skl 5
   * with no way back in. Reported from the arsenal sheet after the first pass.
   */
  it('keeps offering a placed Skill Boost, because its row was a guess', () => {
    const l = leader({ advancements: [boost({ appliesTo: placed })] })
    expect(advancementsToRepair(l)).toHaveLength(1)
  })

  /* Confirming mints an id, and that is what settles it. */
  it('stops offering it once a person has confirmed the row', () => {
    const l = leader({ advancements: [boost({ id: 'adv_x', appliesTo: placed })] })
    expect(advancementsToRepair(l)).toEqual([])
  })

  it('knows which rows were guessed and which were chosen', () => {
    expect(rowIsGuessed(boost())).toBe(true)
    expect(rowIsGuessed(boost({ id: 'adv_x' }))).toBe(false)
    expect(rowIsGuessed(legacy())).toBe(false)
    expect(rowIsGuessed(null)).toBe(false)
  })

  it('is safe on a leader with nothing at all', () => {
    expect(advancementsToRepair(null)).toEqual([])
    expect(advancementsToRepair({})).toEqual([])
  })
})

describe('rows a name might mean', () => {
  it('names the three Skill Boosts on the attack table', () => {
    const out = ambiguousRows({ tableId: 'attack', name: 'Skill Boost' })
    expect(out.map((r) => r.statTo)).toEqual([5, 6, 7])
  })

  it('names the two on the tactical table', () => {
    expect(ambiguousRows({ tableId: 'tactical', name: 'Skill Boost' })).toHaveLength(2)
  })

  /* Every other name is printed once, so there is nothing to ask about. */
  it('is empty for a name printed once', () => {
    expect(ambiguousRows({ tableId: 'attack', name: 'Draw Out Secrets' })).toEqual([])
    expect(ambiguousRows({ tableId: 'attack', name: 'Attack Signature' })).toEqual([])
  })

  it('is empty for a table or a name it does not know', () => {
    expect(ambiguousRows({ tableId: 'nope', name: 'Skill Boost' })).toEqual([])
    expect(ambiguousRows(null)).toEqual([])
    expect(rowsNamed(null)).toEqual([])
  })
})

/**
 * The shape a real pre-v0.22.2 record has, which is **not** the shape the first
 * fixture for this invented. No `id` and no `appliesTo`: `uid('adv')` arrived in
 * the same change that started asking for a target. Keying anything on `id`
 * therefore compares undefined to undefined and hits every row at once, which
 * is exactly what a player reported.
 */
describe('advancements as they were actually recorded before v0.22.2', () => {
  const legacy = () => leader({
    advancements: [
      { tableId: 'attack', tableName: 'Attack Modification', name: 'Draw Out Secrets', tableValue: 9, page: 39, tier: 1, boxIndex: 0, to: 'leader' },
      { tableId: 'attack', tableName: 'Attack Modification', name: 'Skill Boost', tableValue: 7, page: 39, tier: 1, boxIndex: 1, to: 'leader' },
    ],
  })

  it('finds both, though neither carries an id', () => {
    const out = advancementsToRepair(legacy())
    expect(out).toHaveLength(2)
    expect(out.every((a) => a.id === undefined)).toBe(true)
  })

  /* The index into the holder's own array is the only identity these have,
     and it is what the repair addresses them by. */
  it('gives each a distinct index in the holder’s own list', () => {
    const l = legacy()
    const at = advancementsToRepair(l).map((a) => l.advancements.indexOf(a))
    expect(at).toEqual([0, 1])
  })

  it('placing one by index leaves the other alone', () => {
    const l = legacy()
    const place = (list, index, patch) => list.map((a, i) => (i === index ? { ...a, ...patch } : a))
    const after = place(l.advancements, 1, { appliesTo: { key: 'k', name: 'Blowdart', slot: 'attack' } })
    expect(after[0].appliesTo).toBeUndefined()
    expect(after[1].appliesTo.name).toBe('Blowdart')
  })

  /* The Skill Boost's recorded row is whatever came first alphabetically in the
     offer, not what was taken — so the repair must be able to correct it. */
  it('lets the recorded Skill Boost row be swapped for the one really taken', () => {
    const l = legacy()
    const wrong = rowFor(l.advancements[1])
    expect(wrong.statTo).toBe(5)
    const choices = ambiguousRows(l.advancements[1])
    const right = choices[1]
    expect(right.statTo).toBe(6)
    // Blowdart is Skl 5: illegal for the recorded row, legal for the real one.
    expect(targetsFor(l, attack, wrong, () => blowdart)[0].eligible).toBe(false)
    expect(targetsFor(l, attack, right, () => blowdart)[0].eligible).toBe(true)
  })
})
