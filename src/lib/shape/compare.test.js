import { describe, it, expect } from 'vitest'
import {
  canonical, sameInSubstance, summariseArsenal, summariseCampaign,
  describeConflict, moreRecent,
} from './compare.js'
import { createArsenal, createModel, createInjury, createEquipment, createLeader, createTotem } from './arsenal.js'
import { createCampaign, createGame, createParticipation } from './campaign.js'

describe('canonical', () => {
  it('ignores the order fields were written in', () => {
    // A document that has been through a server round trip is not a different
    // document.
    expect(canonical({ a: 1, b: 2 })).toBe(canonical({ b: 2, a: 1 }))
    expect(canonical({ x: { p: 1, q: 2 } })).toBe(canonical({ x: { q: 2, p: 1 } }))
  })
  it('drops updatedAt at the top level, and only there', () => {
    expect(canonical({ id: 'a', updatedAt: 1 })).toBe(canonical({ id: 'a', updatedAt: 999 }))
    // Nested, it is somebody's data rather than a save clock.
    expect(canonical({ x: { updatedAt: 1 } })).not.toBe(canonical({ x: { updatedAt: 2 } }))
  })
  it('does not confuse arrays with their contents reordered', () => {
    expect(canonical({ m: [1, 2] })).not.toBe(canonical({ m: [2, 1] }))
  })
})

describe('sameInSubstance', () => {
  const base = createArsenal({ id: 'ars_1', scrip: 4, models: [createModel({ id: 'm1', cost: 4 })] })

  it('is true for the same document saved at two different moments', () => {
    expect(sameInSubstance({ ...base, updatedAt: 1 }, { ...base, updatedAt: 5000 })).toBe(true)
  })
  it('is false the moment anything real differs', () => {
    expect(sameInSubstance(base, { ...base, scrip: 5 })).toBe(false)
    expect(sameInSubstance(base, { ...base, models: [] })).toBe(false)
  })
  it('is false for nothing, rather than throwing', () => {
    expect(sameInSubstance(null, base)).toBe(false)
    expect(sameInSubstance(base, undefined)).toBe(false)
  })
})

describe('summariseArsenal', () => {
  it('reports the numbers a player recognises', () => {
    const a = createArsenal({
      scrip: 7,
      leader: createLeader({ name: 'Cletus', experience: { boxesChecked: 3 }, advancements: [{ n: 1 }] }),
      models: [
        createModel({ id: 'm1', cost: 4 }),
        createModel({ id: 'm2', cost: 13 }),
        createModel({ id: 'm3', cost: 6, annihilated: true }),
      ],
      injuries: [
        createInjury({ id: 'i1', name: 'Broken Arm' }),
        createInjury({ id: 'i2', name: 'Healed', removedAt: 1 }),
      ],
      equipment: [createEquipment({ id: 'e1', name: 'Pistol' })],
      totem: createTotem({ name: 'Toty' }),
    })
    expect(summariseArsenal(a)).toEqual({
      leader: 'Cletus',
      scrip: 7,
      models: 2,          // annihilated dropped — it cannot be hired
      soulstones: 17,
      injuries: 1,        // healed dropped
      equipment: 1,
      experience: 3,
      advancements: 1,
      totem: 'Toty',
    })
  })
  it('names an unnamed leader rather than showing a blank', () => {
    expect(summariseArsenal(createArsenal()).leader).toBe('(unnamed)')
  })
})

describe('summariseCampaign', () => {
  it('reports the table, not the player', () => {
    const c = createCampaign({
      name: 'The Long Winter', weeksTotal: 12, weekMode: 'manual', manualWeek: 4,
      games: [createGame({ id: 'g1' })],
      participants: [createParticipation({ arsenalId: 'ars_1' })],
    })
    expect(summariseCampaign(c)).toMatchObject({
      name: 'The Long Winter', weeksTotal: 12, week: 4, weekMode: 'manual', games: 1, players: 1,
    })
  })
  it('has no week to report in calendar mode, where it is derived', () => {
    expect(summariseCampaign(createCampaign()).week).toBeNull()
  })
})

describe('describeConflict — arsenals', () => {
  const mine = createArsenal({
    id: 'ars_1', updatedAt: 2000, scrip: 1,
    leader: createLeader({ name: 'Cletus' }),
    models: [createModel({ id: 'm1', name: 'Terror Tot', cost: 4, addedWeek: 0 }),
             createModel({ id: 'm2', name: 'Nekima', cost: 13, addedWeek: 3 })],
    injuries: [],
    equipment: [],
  })
  const theirs = createArsenal({
    id: 'ars_1', updatedAt: 1000, scrip: 6,
    leader: createLeader({ name: 'Cletus' }),
    models: [createModel({ id: 'm1', name: 'Terror Tot', cost: 4, addedWeek: 0 })],
    injuries: [createInjury({ id: 'i1', name: 'Broken Arm' })],
    equipment: [],
  })

  const c = describeConflict({ kind: 'arsenal', mine, theirs })

  it('knows they genuinely differ', () => {
    expect(c.identical).toBe(false)
    expect(c.id).toBe('ars_1')
  })

  it('lists the scalar differences with labels a person can read', () => {
    const byKey = Object.fromEntries(c.differences.map((d) => [d.key, d]))
    expect(byKey.scrip).toMatchObject({ label: 'Scrip', mine: 1, theirs: 6 })
    expect(byKey.models).toMatchObject({ mine: 2, theirs: 1 })
    expect(byKey.injuries).toMatchObject({ mine: 0, theirs: 1 })
    // Unchanged things must not appear — a diff that lists everything is noise.
    expect(byKey.leader).toBeUndefined()
  })

  it('says what each side has that the other does not — the part that decides it', () => {
    const models = c.sets.find((s) => s.label === 'models')
    expect(models.onlyMine).toEqual(['Nekima (week 3)'])
    expect(models.onlyTheirs).toEqual([])
    const injuries = c.sets.find((s) => s.label === 'injuries')
    expect(injuries.onlyTheirs).toEqual(['Broken Arm'])
  })

  it('omits collections where nothing differs', () => {
    expect(c.sets.find((s) => s.label === 'equipment')).toBeUndefined()
  })

  it('recognises two copies that say the same thing', () => {
    const same = describeConflict({ kind: 'arsenal', mine, theirs: { ...mine, updatedAt: 99 } })
    expect(same.identical).toBe(true)
    expect(same.differences).toEqual([])
    expect(same.sets).toEqual([])
  })
})

describe('describeConflict — campaigns', () => {
  it('compares the table and its games', () => {
    const mine = createCampaign({ id: 'cmp_1', weeksTotal: 12, games: [createGame({ id: 'g1', week: 2, result: 'win' })] })
    const theirs = createCampaign({ id: 'cmp_1', weeksTotal: 8, games: [] })
    const c = describeConflict({ kind: 'campaign', mine, theirs })
    const byKey = Object.fromEntries(c.differences.map((d) => [d.key, d]))
    expect(byKey.weeksTotal).toMatchObject({ mine: 12, theirs: 8 })
    expect(c.sets.find((s) => s.label === 'games').onlyMine).toEqual(['week 2 · win'])
  })
})

describe('moreRecent', () => {
  it('orders the two columns without recommending either', () => {
    expect(moreRecent({ mine: { updatedAt: 2 }, theirs: { updatedAt: 1 } })).toBe('mine')
    expect(moreRecent({ mine: { updatedAt: 1 }, theirs: { updatedAt: 2 } })).toBe('theirs')
    expect(moreRecent({ mine: { updatedAt: 1 }, theirs: { updatedAt: 1 } })).toBeNull()
  })
})
