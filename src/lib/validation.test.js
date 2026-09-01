import { describe, it, expect } from 'vitest'
import { checkStructure, checkSource, candidatesFor, availableTriggers } from './validation.js'

/**
 * Legality rules. `checkSource` is the one that decides what a leader may take
 * an action from, and it went eight versions naming a rule it did not enforce
 * (audit v0.5.2 M8, v0.11.0 M4/M5) — so the totem case is asserted here rather
 * than described in a comment.
 *
 * The totem fixtures were rebuilt in v0.16.0. They used to set `isTotem: true`
 * alongside a cost, on the belief — stated in `checkSource` and in a test name —
 * that totems "HAVE costs and so were never caught by the cost test". Checked
 * against the live register: every totem has `cost: null` and says what it is in
 * `characteristics`. The fixtures now match the register rather than the belief,
 * which is the whole point of a fixture.
 */

const model = (patch = {}) => ({
  slug: 'ally',
  name: 'Ally',
  cost: 5,
  keywords: ['angler'],
  actions: [{ name: 'Blowdart', slug: 'blowdart', type: 'attack', triggers: ['Mask — Stumble'] }],
  abilities: ['Stealth'],
  isTotem: false,
  ...patch,
})

describe('checkSource', () => {
  it('accepts an ally under the ceiling that shares a keyword', () => {
    expect(checkSource(model(), 'attack', 'schemer', ['angler']).ok).toBe(true)
  })

  it('refuses a totem, and says so in those words', () => {
    // As the register really serves them: no cost, and the fact in
    // `characteristics`. Both the costless branch and the totem branch fire;
    // what matters is that the player is told which one they picked.
    const totem = model({ name: 'Duke Carcinus', cost: null, characteristics: ['totem', 'unique'] })
    const result = checkSource(totem, 'attack', 'schemer', ['angler'])
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/totem/i)
  })

  it('would still refuse a totem if the register ever gave one a cost', () => {
    // Defensive: the totem branch does not lean on cost being null, so a data
    // change upstream cannot quietly make totems selectable.
    const totem = model({ name: 'Duke Carcinus', cost: 4, characteristics: ['totem'] })
    const result = checkSource(totem, 'attack', 'schemer', ['angler'])
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/totem/i)
  })

  it('no longer claims to bar totems in the cost message', () => {
    // The old wording said "Masters, totems and costless models…" on the cost
    // branch, which is where the claim was false.
    const master = model({ cost: 0 })
    const costProblem = checkSource(master, 'attack', 'schemer', ['angler']).problems
      .find((p) => /costless/.test(p))
    expect(costProblem).toBeDefined()
    expect(costProblem).not.toMatch(/totem/i)
  })

  it('refuses a master, which carries no cost at all', () => {
    expect(checkSource(model({ cost: 0 }), 'attack', 'schemer', ['angler']).ok).toBe(false)
    expect(checkSource(model({ cost: null }), 'attack', 'schemer', ['angler']).ok).toBe(false)
  })

  it('refuses a model over the slot ceiling', () => {
    // Schemer's attack cap is 5.
    const result = checkSource(model({ cost: 9 }), 'attack', 'schemer', ['angler'])
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/over the 5 ceiling/)
  })

  it('refuses a model sharing no keyword with the leader', () => {
    const result = checkSource(model({ keywords: ['tricksy'] }), 'attack', 'schemer', ['angler'])
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/shares no keyword/)
  })

  it('reports every reason at once rather than only the first', () => {
    const bad = model({ cost: 99, keywords: ['elsewhere'], characteristics: ['totem'] })
    expect(checkSource(bad, 'attack', 'schemer', ['angler']).problems.length).toBeGreaterThan(2)
  })
})

describe('candidatesFor', () => {
  it('drops totems from the list a player picks from', () => {
    const roster = [model(), model({ slug: 'totem', name: 'Totem', characteristics: ['totem'] })]
    const rows = candidatesFor('attack', roster, 'schemer', ['angler'])
    expect(rows.map((r) => r.model.slug)).toEqual(['ally'])
  })

  it('returns nothing for a slot the archetype does not have', () => {
    // Heavy Hitter has no ability slot.
    expect(candidatesFor('ability', [model()], 'heavy_hitter', ['angler'])).toEqual([])
  })
})

describe('checkStructure', () => {
  it('needs an archetype before it can say anything', () => {
    expect(checkStructure('', { attack: [], tactical: [], ability: [] }, '').ok).toBe(false)
  })

  it('asks for a trigger only from the archetype that keeps one', () => {
    const full = { attack: [{}], tactical: [{}], ability: [] }
    expect(checkStructure('heavy_hitter', full, '').problems.join(' ')).toMatch(/trigger/)
    expect(checkStructure('heavy_hitter', full, 'Mask — Stumble').ok).toBe(true)
  })

  it('rejects a trigger on an archetype that does not keep one', () => {
    const full = { attack: [{}], tactical: [{}], ability: [{}] }
    expect(checkStructure('generalist', full, 'Mask — Stumble').ok).toBe(false)
  })
})

describe('availableTriggers', () => {
  it('offers only the triggers of the attack action actually taken', () => {
    expect(availableTriggers({ attack: [{ triggers: ['A', 'B'] }] })).toEqual(['A', 'B'])
    expect(availableTriggers({ attack: [] })).toEqual([])
    expect(availableTriggers({})).toEqual([])
  })
})
