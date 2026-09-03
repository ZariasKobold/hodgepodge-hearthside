import { describe, it, expect } from 'vitest'
import {
  createArsenal, createLeader, createModel, createInjury, createEquipment, createTotem,
  ARSENAL_SCHEMA_VERSION, STARTING_ARSENAL_WEEK, defined,
  joinCampaignPatch, leaveCampaignPatch, isInCampaign, duplicateArsenal,
  liveModels, totalFor, injuriesFor, injuryCountForModel, modelIsAnnihilated,
  activeInjuryCount, standingRating, ratingForGame, heldEquipmentIds,
  injuryNamesFor, isOutOfKeyword, hiresInWeek, mustHireThisWeek,
  startingArsenalSpend, startingScripPatch, owedStartingScrip,
} from './arsenal.js'

describe('createArsenal', () => {
  it('is a top-level object with no campaign', () => {
    const a = createArsenal()
    expect(a.schemaVersion).toBe(ARSENAL_SCHEMA_VERSION)
    expect(a.campaignId).toBeNull()
    expect(a.ownerUserId).toBeNull()
    expect(isInCampaign(a)).toBe(false)
    expect(a.id.startsWith('ars_')).toBe(true)
  })
  it('carries a leader, and the leader carries no faction', () => {
    // Faction, keywords and scrip belong to the arsenal; only the leader's own
    // fields stay on the leader. That split is what v0.1 got wrong.
    const a = createArsenal()
    expect(a.leader.name).toBe('')
    expect(a.leader.faction).toBeUndefined()
    expect(a.faction).toBe('')
  })
})

describe('defined', () => {
  // Every factory here spreads its patch last, so `{ id: undefined }` blanks the
  // id it just minted. This is the guard against repeating that.
  it('drops undefined keys so a patch cannot blank a minted field', () => {
    expect(defined({ a: 1, b: undefined, c: null })).toEqual({ a: 1, c: null })
    expect(createModel(defined({ id: undefined, name: 'Bayou Gremlin' })).id).toBeTruthy()
  })
})

describe('the campaign link', () => {
  it('joins a table', () => {
    const a = createArsenal()
    expect(joinCampaignPatch(a, 'cmp_1')).toEqual({ campaignId: 'cmp_1' })
  })
  it('is idempotent against the table it is already at', () => {
    const a = createArsenal({ campaignId: 'cmp_1' })
    expect(joinCampaignPatch(a, 'cmp_1')).toEqual({ campaignId: 'cmp_1' })
  })
  it('refuses a second table rather than moving quietly', () => {
    const a = createArsenal({ campaignId: 'cmp_1' })
    expect(() => joinCampaignPatch(a, 'cmp_2')).toThrow(/already in a campaign/)
  })
  it('leaves without losing anything', () => {
    expect(leaveCampaignPatch()).toEqual({ campaignId: null })
  })
})

describe('duplicateArsenal', () => {
  const source = createArsenal({
    ownerUserId: 'u1',
    campaignId: 'cmp_1',
    faction: 'neverborn',
    keywords: ['nephilim', 'woe'],
    scrip: 9,
    displayName: 'Cletus',
    leader: createLeader({
      name: 'Cletus',
      archetype: 'brute',
      experience: { boxesChecked: 5 },
      advancements: [{ name: 'Tougher' }],
      miraculousRecoveryUsed: true,
    }),
    models: [
      createModel({ id: 'm1', name: 'Terror Tot', cost: 4, addedWeek: 3, scripPaid: 4 }),
      createModel({ id: 'm2', name: 'Doppelganger', cost: 8, addedWeek: 2, annihilated: true }),
    ],
    injuries: [createInjury({ name: 'Broken Arm' })],
    equipment: [createEquipment({ equipmentId: 'pistol', name: 'Pistol' })],
    totem: createTotem({ name: 'Toty' }),
  })

  const copy = duplicateArsenal(source)

  it('is a different object with a different id', () => {
    expect(copy.id).not.toBe(source.id)
    expect(copy.campaignId).toBeNull()
  })
  it('keeps the identity — leader, keywords, crew card', () => {
    expect(copy.leader.name).toBe('Cletus')
    expect(copy.leader.archetype).toBe('brute')
    expect(copy.keywords).toEqual(['nephilim', 'woe'])
    expect(copy.faction).toBe('neverborn')
  })
  it('keeps none of the history — it is a new campaign', () => {
    expect(copy.scrip).toBe(0)
    expect(copy.injuries).toEqual([])
    expect(copy.equipment).toEqual([])
    expect(copy.totem).toBeNull()
    expect(copy.leader.experience.boxesChecked).toBe(0)
    expect(copy.leader.advancements).toEqual([])
    expect(copy.leader.miraculousRecoveryUsed).toBe(false)
  })
  it('brings the survivors, as a starting arsenal with fresh ids', () => {
    expect(copy.models).toHaveLength(1)
    expect(copy.models[0].name).toBe('Terror Tot')
    expect(copy.models[0].id).not.toBe('m1')
    expect(copy.models[0].id).toBeTruthy()
    expect(copy.models[0].addedWeek).toBe(STARTING_ARSENAL_WEEK)
    expect(copy.models[0].scripPaid).toBe(0)
  })
  it('leaves the original alone', () => {
    expect(source.models).toHaveLength(2)
    expect(source.scrip).toBe(9)
  })
})

describe('selectors', () => {
  const a = createArsenal({
    models: [
      createModel({ id: 'm1', name: 'Tot', cost: 4, addedWeek: 1 }),
      createModel({ id: 'm2', name: 'Nekima', cost: 13, addedWeek: 2 }),
      createModel({ id: 'm3', name: 'Ghost', cost: 6, addedWeek: 2, annihilated: true }),
      createModel({ id: 'm4', name: 'Lady J', cost: 10, addedWeek: 2, titleGroup: 'ladyj' }),
    ],
    injuries: [
      createInjury({ id: 'i1', name: 'Broken Arm', modelId: 'm1' }),
      createInjury({ id: 'i2', name: 'Concussion', modelId: 'm1' }),
      createInjury({ id: 'i3', name: 'Limp', titleGroup: 'ladyj' }),
      createInjury({ id: 'i4', name: 'Scarred' }),                       // the leader
      createInjury({ id: 'i5', name: 'Healed', modelId: 'm2', removedAt: 1 }),
    ],
    equipment: [
      createEquipment({ equipmentId: 'pistol', name: 'Pistol', cc: 1 }),
      createEquipment({ equipmentId: 'blight', name: 'Blight', cc: 4, thirst: true }),
    ],
    leader: createLeader({ advancements: [{ n: 1 }, { n: 2 }] }),
    totem: createTotem({ advancements: [{ n: 3 }] }),
  })

  it('drops annihilated models from the total', () => {
    expect(liveModels(a)).toHaveLength(3)
    expect(totalFor(a)).toBe(4 + 13 + 10)
  })
  it('files injuries against exactly one subject', () => {
    expect(injuriesFor(a, { modelId: 'm1' }).map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(injuriesFor(a, { titleGroup: 'ladyj' }).map((i) => i.id)).toEqual(['i3'])
    expect(injuriesFor(a, {}).map((i) => i.id)).toEqual(['i4'])
    expect(injuriesFor(a, { modelId: 'm2' })).toEqual([])   // healed
  })
  it('counts a titled model by its group', () => {
    expect(injuryCountForModel(a, a.models[3])).toBe(1)
    expect(injuryCountForModel(a, a.models[0])).toBe(2)
    expect(modelIsAnnihilated(a, a.models[0])).toBe(false)
  })
  it('counts live injuries across the crew', () => {
    expect(activeInjuryCount(a)).toBe(4)
  })
  it('rates the standing crew without equipment, and a game with it', () => {
    // 2 leader advancements + 1 totem advancement − 4 injuries
    expect(standingRating(a)).toBe(-1)
    expect(ratingForGame(a, { equipmentHired: [{}, {}] })).toBe(1)
  })
  it('reports held equipment ids for the Those Who Thirst limit', () => {
    expect(heldEquipmentIds(a)).toEqual(['pistol', 'blight'])
  })
  it('reports injury names so a duplicate result can be recognised', () => {
    expect(injuryNamesFor(a, a.models[0])).toEqual(['Broken Arm', 'Concussion'])
    expect(injuryNamesFor(a, null)).toEqual(['Scarred'])
  })
  it('groups hires by week', () => {
    expect(hiresInWeek(a, 2).map((m) => m.id)).toEqual(['m2', 'm3', 'm4'])
  })
})

describe('isOutOfKeyword', () => {
  it('is false when either side has no keywords to compare', () => {
    expect(isOutOfKeyword({ keywords: [] }, ['nephilim'])).toBe(false)
    expect(isOutOfKeyword({ keywords: ['nephilim'] }, [])).toBe(false)
  })
  it('is true only when nothing overlaps', () => {
    expect(isOutOfKeyword({ keywords: ['woe'] }, ['nephilim', 'woe'])).toBe(false)
    expect(isOutOfKeyword({ keywords: ['tormented'] }, ['nephilim', 'woe'])).toBe(true)
  })
})

describe('mustHireThisWeek', () => {
  const a = createArsenal({
    models: [createModel({ addedWeek: STARTING_ARSENAL_WEEK }), createModel({ addedWeek: 2 })],
  })

  it('never nags in the first week', () => {
    expect(mustHireThisWeek(a, 1)).toBe(false)
  })
  it('is satisfied by a hire in the week', () => {
    expect(mustHireThisWeek(a, 2)).toBe(false)
    expect(mustHireThisWeek(a, 3)).toBe(true)
  })
  it('does not bill a late joiner for weeks they were not at the table', () => {
    // Joined in week four: weeks two and three were not theirs to miss.
    expect(mustHireThisWeek(a, 4, { joinedWeek: 4 })).toBe(false)
    expect(mustHireThisWeek(a, 5, { joinedWeek: 4 })).toBe(true)
  })
})

describe('the starting scrip, p. 15', () => {
  // "Each soulstone a player chooses not to spend during this step becomes one
  // scrip, up to a maximum of three scrip." The creation screen has shown this
  // number since v0.1 and never paid it into the arsenal.
  const built = (costs, patch = {}) => createArsenal({
    models: costs.map((c) => createModel({ cost: c, addedWeek: STARTING_ARSENAL_WEEK })),
    ...patch,
  })

  it('measures the starting arsenal, not the whole roster', () => {
    const midCampaign = createArsenal({
      models: [
        createModel({ cost: 20, addedWeek: STARTING_ARSENAL_WEEK }),
        createModel({ cost: 13, addedWeek: 2 }),
        createModel({ cost: 7, addedWeek: 3 }),
      ],
    })
    // 40ss on the roster, but only 20 of it was the starting arsenal.
    expect(totalFor(midCampaign)).toBe(40)
    expect(startingArsenalSpend(midCampaign)).toBe(20)
    expect(owedStartingScrip(midCampaign)).toBe(3)
  })

  it('still counts a starting model that has since been annihilated', () => {
    // The soulstones were spent. A model dying in week four does not make the
    // starting arsenal retroactively cheaper.
    const bereaved = built([20, 4])
    bereaved.models[1].annihilated = true
    expect(startingArsenalSpend(bereaved)).toBe(24)
    expect(owedStartingScrip(bereaved)).toBe(1)
  })

  it('pays the grant, capped at three', () => {
    expect(startingScripPatch(built([22]))).toEqual({ scrip: 3, startingScripGranted: 3 })
    expect(startingScripPatch(built([24]))).toEqual({ scrip: 1, startingScripGranted: 1 })
    expect(startingScripPatch(built([25]))).toBeNull()   // nothing unspent, nothing owed
  })

  it('reconciles rather than appending — calling it twice pays once', () => {
    let a = built([20])
    a = { ...a, ...startingScripPatch(a) }
    expect(a.scrip).toBe(3)
    expect(startingScripPatch(a)).toBeNull()
    a = { ...a, ...(startingScripPatch(a) || {}) }
    expect(a.scrip).toBe(3)
  })

  it('takes the change back when a starting model is added afterwards', () => {
    let a = built([20])
    a = { ...a, ...startingScripPatch(a) }
    expect(a.scrip).toBe(3)
    // Spend the other 5: the grant is now 0 and the balance goes with it.
    a = { ...a, models: [...a.models, createModel({ cost: 5, addedWeek: STARTING_ARSENAL_WEEK })] }
    a = { ...a, ...startingScripPatch(a) }
    expect(a.scrip).toBe(0)
    expect(a.startingScripGranted).toBe(0)
  })

  it('never puts a player into debt', () => {
    // Paid 3, spent it all on a hire, then adds a starting model.
    let a = built([20], { scrip: 0, startingScripGranted: 3 })
    a = { ...a, models: [...a.models, createModel({ cost: 5, addedWeek: STARTING_ARSENAL_WEEK })] }
    expect(startingScripPatch(a)).toEqual({ scrip: 0, startingScripGranted: 0 })
  })

  it('distinguishes "never reconciled" from "reconciled to nothing"', () => {
    // null is owed; 0 has been settled. Guessing "already paid" about an
    // arsenal nobody has asked would quietly keep somebody's scrip.
    expect(createArsenal().startingScripGranted).toBeNull()
    expect(owedStartingScrip(built([20]))).toBe(3)
    expect(owedStartingScrip(built([20], { startingScripGranted: 0 }))).toBe(0)
    expect(owedStartingScrip(built([20], { startingScripGranted: 3 }))).toBe(0)
  })
})
