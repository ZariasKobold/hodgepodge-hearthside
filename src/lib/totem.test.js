import { describe, it, expect } from 'vitest'
import { totemPicks, totemRow, targetsFor, advancementsOn, placementProblem } from './advancement.js'
import { ADVANCEMENT_TABLES, findTable } from '../data/advancements.js'
import { createTotem } from './shape/arsenal.js'

/**
 * A totem's starting abilities and actions (v0.29.3).
 *
 * Reported by a player: her totem "has absolutely zero actions and abilities.
 * It just... exists." The app had kept each totem's stats off pp. 52–53 and
 * not what it can do. Totems are built here the way `Aftermath.jsx` builds
 * them, with the flip value as `tableValue`.
 */
const totemFor = (value, patch = {}) => {
  const row = findTable('totem').entries.find((r) => r.value === value)
  return createTotem({ name: row.name, tableValue: row.value, stats: row.stats, ...patch })
}

describe('the totem table', () => {
  const rows = ADVANCEMENT_TABLES.find((t) => t.id === 'totem').entries

  it('gives every totem but the Mini-Master at least one printed action', () => {
    for (const r of rows) {
      if (r.chooseAction) expect(r.actions, r.name).toEqual([])
      else expect(r.actions.length, r.name).toBeGreaterThan(0)
    }
  })

  it('reads an action with a resist as an attack, as the Action table does', () => {
    for (const r of rows) for (const a of r.actions) expect(a.kind === 'attack', a.name).toBe(Boolean(a.resistedBy))
  })
})

describe('totemPicks', () => {
  it('lists a Gravehand’s actions by kind, with nothing stored on the totem', () => {
    const t = totemFor(9)
    const p = totemPicks(t)
    expect(p.attack.map((a) => a.name)).toEqual(['Grave’s Curse'])
    expect(p.tactical.map((a) => a.name)).toEqual(['Command Corpse'])
    expect(p.ability).toEqual([])
    expect(t.picks).toBeUndefined()
  })

  it('carries the printed trigger and abilities', () => {
    const p = totemPicks(totemFor(4))
    expect(p.ability.map((a) => a.name)).toEqual(['Construct Savant'])
    expect(p.attack[0].triggers).toEqual(['Improvised Mechanics'])
  })

  it('finds the row by name for a totem with no flip value', () => {
    expect(totemRow({ name: 'Ringmaster' }).value).toBe(11)
  })

  it('adds the Mini-Master’s chosen action under its kind', () => {
    const row = findTable('totem').entries.find((r) => r.chooseAction)
    const t = createTotem({ name: row.name, tableValue: row.value, chosenAction: { name: 'Bayou Two-Card', kind: 'tactical' } })
    expect(totemPicks(t).tactical.map((a) => a.name)).toEqual(['Bayou Two-Card'])
  })

  it('is empty for something that is not a totem on the table', () => {
    expect(totemPicks({ name: 'Somebody' })).toEqual({ attack: [], tactical: [], ability: [] })
  })
})

describe('advancements given to the totem', () => {
  const attack = findTable('attack')
  const boost = attack.entries.find((e) => e.statTo === 6 && e.statFrom.includes(5))

  it('are offered its printed actions of the right kind', () => {
    const targets = targetsFor(totemFor(11), attack, boost)
    expect(targets.map((t) => t.name)).toEqual(['Dismissive Wave', 'Lure'])
    expect(targets.every((t) => t.eligible !== false || t.why)).toBe(true)
  })

  it('a written-in name from before v0.29.3 still sits on the printed action', () => {
    const adv = { id: 'adv_1', tableId: 'attack', name: 'Draw Out Secrets', appliesTo: { key: null, name: 'Grave’s Curse', written: true } }
    const t = totemFor(9, { advancements: [adv] })
    expect(advancementsOn(t, 'totem::attack::Grave’s Curse')).toEqual([adv])
    expect(placementProblem(t, adv)).toBeNull()
  })

  it('a written-in name that is the totem’s action of the other kind is caught', () => {
    const adv = { id: 'adv_1', tableId: 'attack', name: 'Draw Out Secrets', appliesTo: { key: null, name: 'Command Corpse', written: true } }
    expect(placementProblem(totemFor(9, { advancements: [adv] }), adv).kind).toBe('wrong-kind')
  })
})
