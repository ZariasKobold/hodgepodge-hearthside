import { describe, it, expect } from 'vitest'
import {
  createCrew, selectionOf, selectionFromCrew, crewGaps, upsertCrew, removeCrew, copyCrew, nextCrewName,
} from './crews.js'
import { crewCost, crewRating, LEADER, TOTEM } from './encounter.js'
import { createArsenal, createModel, createEquipment, createTotem, createLeader } from './shape/arsenal.js'

const arsenal = createArsenal({
  keywords: ['angler', 'big-hat'],
  leader: createLeader({ name: 'Cletus', advancements: [{ id: 'a1' }] }),
  models: [
    createModel({ id: 'm1', name: 'Buckaroo', cost: 6 }),
    createModel({ id: 'm2', name: 'Hermits', cost: 5 }),
    createModel({ id: 'm3', name: 'Gone', cost: 4, annihilated: true }),
  ],
  equipment: [
    createEquipment({ id: 'e1', name: 'Duplicator' }),
    createEquipment({ id: 'e2', name: 'Coffee', annihilated: true }),
  ],
  totem: createTotem({ name: 'Willing Vessel' }),
})

describe('a saved crew', () => {
  it('is read by the encounter arithmetic as it stands', () => {
    const crew = createCrew({ modelIds: ['m1', 'm2'], equipment: [{ rowId: 'e1', holder: 'm1' }] })
    expect(crew.id).toMatch(/^crw_/)
    expect(crewCost(crew, arsenal)).toBe(11)
    expect(crewRating(crew, arsenal)).toBe(2) // 1 kit + 1 advancement
  })

  it('loads into a game with only what is still in the arsenal', () => {
    const crew = createCrew({
      id: 'crw_1', modelIds: ['m1', 'm3'], totem: true,
      equipment: [{ rowId: 'e1', holder: 'm3' }, { rowId: 'e2', holder: LEADER }],
    })
    expect(selectionFromCrew(crew, arsenal)).toEqual({ crewId: 'crw_1', modelIds: ['m1'], totem: true, equipment: [] })
    expect(crewGaps(crew, arsenal)).toEqual(['Gone', 'Coffee'])
    expect(selectionFromCrew(crew, { ...arsenal, totem: null }).totem).toBe(false)
  })

  it('keeps kit on the totem when the totem comes', () => {
    const crew = createCrew({ totem: true, equipment: [{ rowId: 'e1', holder: TOTEM }] })
    expect(selectionFromCrew(crew, arsenal).equipment).toEqual([{ rowId: 'e1', holder: TOTEM }])
  })

  it('takes only the hiring fields from an encounter', () => {
    const sel = selectionOf({ modelIds: ['m1'], totem: 1, equipment: [{ rowId: 'e1', holder: 'm1', row: {} }], opponent: {} })
    expect(sel).toEqual({ modelIds: ['m1'], totem: true, equipment: [{ rowId: 'e1', holder: 'm1' }] })
  })
})

describe('the list of crews', () => {
  it('adds, replaces, copies and removes', () => {
    const a = createCrew({ id: 'crw_a', name: 'Fishers' })
    let list = upsertCrew([], a)
    list = upsertCrew(list, { ...a, name: 'Anglers' })
    expect(list.map((c) => c.name)).toEqual(['Anglers'])
    const copy = copyCrew(list[0])
    expect(copy.id).not.toBe('crw_a')
    expect(copy.name).toBe('Anglers (copy)')
    list = upsertCrew(list, copy)
    expect(nextCrewName(list)).toBe('Crew 3')
    expect(removeCrew(list, 'crw_a').map((c) => c.id)).toEqual([copy.id])
  })
})
