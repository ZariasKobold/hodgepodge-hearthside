import { describe, it, expect } from 'vitest'
import {
  needsTarget, targetsFor, advancementsOn, advancedAction, rowFor,
  gainedActions, gainedActionKey, unplacedAdvancements,
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

describe('advancements that were never told which action', () => {
  const legacy = (over = {}) => ({
    id: 'old_1', tableId: 'attack', tableName: 'Attack Modification',
    name: 'Skill Boost', tableValue: 10, page: 40, ...over,
  })

  it('finds the tier-1 ones with no target', () => {
    const l = leader({ advancements: [legacy(), legacy({ id: 'old_2', name: 'Draw Out Secrets', tableValue: 9 })] })
    expect(unplacedAdvancements(l).map((a) => a.id)).toEqual(['old_1', 'old_2'])
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
    expect(unplacedAdvancements(l)).toEqual([])
  })

  it('counts a target already given as placed', () => {
    const l = leader({
      advancements: [legacy({ appliesTo: { key: 'k', name: 'Blowdart', slot: 'attack' } })],
    })
    expect(unplacedAdvancements(l)).toEqual([])
  })

  /* A written-in name is an answer, not a gap — it names an action this app
     cannot list, which is exactly what the field is for. */
  it('counts a hand-written target as placed', () => {
    const l = leader({
      advancements: [legacy({ appliesTo: { key: null, name: 'Whatever It Was', slot: 'attack', written: true } })],
    })
    expect(unplacedAdvancements(l)).toEqual([])
  })

  it('is safe on a leader with nothing at all', () => {
    expect(unplacedAdvancements(null)).toEqual([])
    expect(unplacedAdvancements({})).toEqual([])
  })
})
