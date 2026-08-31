import { describe, it, expect } from 'vitest'
import { checkStructure, checkSource, candidatesFor, availableTriggers } from './validation.js'

/**
 * Legality rules. `checkSource` is the one that decides what a leader may take
 * an action from, and it went eight versions naming a rule it did not enforce
 * (audit v0.5.2 M8, v0.11.0 M4/M5) — so the totem case is asserted here rather
 * than described in a comment.
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

  it('refuses a totem, which has a cost and so was never caught by the cost test', () => {
    const totem = model({ name: 'Duke Carcinus', cost: 4, isTotem: true })
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
    const bad = model({ cost: 99, keywords: ['elsewhere'], isTotem: true })
    expect(checkSource(bad, 'attack', 'schemer', ['angler']).problems.length).toBeGreaterThan(2)
  })
})

describe('candidatesFor', () => {
  it('drops totems from the list a player picks from', () => {
    const roster = [model(), model({ slug: 'totem', name: 'Totem', isTotem: true })]
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
