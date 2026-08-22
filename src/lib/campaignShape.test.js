import { describe, it, expect } from 'vitest'
import {
  createCampaign, createArsenal, createModel, createLeader,
  currentWeek, weeksRemaining, isCampaignOver,
  myArsenal, totalFor, liveModels,
  injuriesFor, injuryCountForModel, modelIsAnnihilated, activeInjuryCount,
  ratingForGame, mustHireThisWeek, gamesInWeek,
  migrateLeaderToCampaign, migrate, SCHEMA_VERSION, DEFAULT_HOUSE_RULES,
  hireRules, isOutOfKeyword, hiresInWeek,
} from './campaignShape.js'

const DAY = 86400000

describe('createCampaign', () => {
  it('starts with one arsenal, owned locally', () => {
    const c = createCampaign()
    expect(c.arsenals).toHaveLength(1)
    expect(myArsenal(c).id).toBe(c.localArsenalId)
    expect(c.schemaVersion).toBe(SCHEMA_VERSION)
  })
  it('defaults to the book\'s house rules', () => {
    expect(createCampaign().houseRules).toEqual(DEFAULT_HOUSE_RULES)
  })
})

describe('currentWeek', () => {
  const start = Date.UTC(2026, 0, 1)
  const c = createCampaign({ startedAt: start })

  it('is week one on the first day', () => {
    expect(currentWeek(c, start)).toBe(1)
    expect(currentWeek(c, start + 6 * DAY)).toBe(1)
  })
  it('rolls on the designated day', () => {
    expect(currentWeek(c, start + 7 * DAY)).toBe(2)
    expect(currentWeek(c, start + 21 * DAY)).toBe(4)
  })
  it('honours a shorter week, which the book explicitly allows', () => {
    const fast = createCampaign({ startedAt: start, houseRules: { weekLengthDays: 3 } })
    expect(currentWeek(fast, start + 6 * DAY)).toBe(3)
  })
  it('lets an organizer claw back a skipped week', () => {
    const nudged = createCampaign({ startedAt: start, weekOffset: -1 })
    expect(currentWeek(nudged, start + 21 * DAY)).toBe(3)
  })
  it('never goes below one, even with a silly offset', () => {
    const c2 = createCampaign({ startedAt: start, weekOffset: -99 })
    expect(currentWeek(c2, start)).toBe(1)
  })
  it('reports remaining weeks and completion', () => {
    expect(weeksRemaining(c, start + 70 * DAY)).toBe(1)
    expect(isCampaignOver(c, start + 70 * DAY)).toBe(false)
    expect(isCampaignOver(c, start + 84 * DAY)).toBe(true)
  })
})

describe('arsenal totals', () => {
  it('excludes annihilated models — they cannot be hired', () => {
    const a = createArsenal({
      models: [
        createModel({ cost: 7 }),
        createModel({ cost: 5 }),
        createModel({ cost: 9, annihilated: true }),
      ],
    })
    expect(liveModels(a)).toHaveLength(2)
    expect(totalFor(a)).toBe(12)
  })
})

describe('injuries', () => {
  const titled = createModel({ id: 'm1', name: 'Somebody', titleGroup: 'somebody' })
  const otherTitle = createModel({ id: 'm2', name: 'Somebody, Retitled', titleGroup: 'somebody' })
  const plain = createModel({ id: 'm3', name: 'Ordinary' })

  const arsenal = createArsenal({
    models: [titled, otherTitle, plain],
    injuries: [
      { id: 'i1', titleGroup: 'somebody', name: 'A' },
      { id: 'i2', titleGroup: 'somebody', name: 'B' },
      { id: 'i3', modelId: 'm3', name: 'C' },
      { id: 'i4', name: 'D' },                       // leader
      { id: 'i5', modelId: 'm3', name: 'E', removedAt: 123 }, // healed
    ],
  })

  it('shares injuries across every version of a titled model', () => {
    expect(injuryCountForModel(arsenal, titled)).toBe(2)
    expect(injuryCountForModel(arsenal, otherTitle)).toBe(2)
  })
  it('keeps ordinary models separate and ignores healed injuries', () => {
    expect(injuryCountForModel(arsenal, plain)).toBe(1)
  })
  it('treats an injury with no subject as the leader\'s', () => {
    expect(injuriesFor(arsenal)).toHaveLength(1)
    expect(injuriesFor(arsenal)[0].id).toBe('i4')
  })
  it('annihilates at three shared injuries', () => {
    expect(modelIsAnnihilated(arsenal, titled)).toBe(false)
    const worse = { ...arsenal, injuries: [...arsenal.injuries, { id: 'i6', titleGroup: 'somebody', name: 'F' }] }
    expect(modelIsAnnihilated(worse, titled)).toBe(true)
    expect(modelIsAnnihilated(worse, otherTitle)).toBe(true)
  })
})

describe('ratingForGame', () => {
  it('counts equipment hired for THAT game, not equipment owned', () => {
    const a = createArsenal({
      leader: createLeader({ advancements: [{}, {}] }),
      equipment: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
      injuries: [{ id: 'i1', modelId: 'm1' }],
    })
    // Owns three, took two: matches the book's worked example (2 + 2 − 1 = 3).
    expect(ratingForGame(a, { equipmentHired: [{ equipmentId: 'e1' }, { equipmentId: 'e2' }] })).toBe(3)
    expect(ratingForGame(a, { equipmentHired: [] })).toBe(1)
  })
  it('goes negative, which the book explicitly allows', () => {
    const a = createArsenal({
      leader: createLeader({ advancements: [{}] }),
      injuries: [{ id: '1' }, { id: '2' }, { id: '3' }],
    })
    expect(ratingForGame(a, { equipmentHired: [] })).toBe(-2)
  })
})

describe('mustHireThisWeek', () => {
  const a = createArsenal({ models: [createModel({ addedWeek: 2 })] })
  it('is never required in week one', () => {
    expect(mustHireThisWeek(a, 1)).toBe(false)
  })
  it('is satisfied by a model added this week', () => {
    expect(mustHireThisWeek(a, 2)).toBe(false)
    expect(mustHireThisWeek(a, 3)).toBe(true)
  })
})

describe('gamesInWeek', () => {
  it('allows several games in one week, as the book states', () => {
    const c = createCampaign()
    const id = c.localArsenalId
    const withGames = {
      ...c,
      games: [
        { id: 'g1', arsenalId: id, week: 2 },
        { id: 'g2', arsenalId: id, week: 2 },
        { id: 'g3', arsenalId: id, week: 3 },
      ],
    }
    expect(gamesInWeek(withGames, id, 2)).toHaveLength(2)
  })
})

describe('migrateLeaderToCampaign', () => {
  const old = {
    name: 'Someone', faction: 'outcasts', keywords: ['angler', 'infamous'],
    archetype: 'schemer', characteristics: ['Living'], size: 2, base: 30,
    advancementPath: 'strategist',
    picks: { attack: [{ key: 'a' }], tactical: [], ability: [] },
    trigger: '', crewCard: { effect: 'heavy_blow', choice: '' },
    arsenal: [{ slug: 'x', name: 'X', cost: 6 }],
  }

  it('moves arsenal-level fields off the leader', () => {
    const c = migrateLeaderToCampaign(old)
    const a = myArsenal(c)
    expect(a.faction).toBe('outcasts')
    expect(a.keywords).toEqual(['angler', 'infamous'])
    expect(a.leader.faction).toBeUndefined()
  })

  it('keeps the leader\'s own fields and the built picks', () => {
    const a = myArsenal(migrateLeaderToCampaign(old))
    expect(a.leader.name).toBe('Someone')
    expect(a.leader.archetype).toBe('schemer')
    expect(a.leader.picks.attack).toHaveLength(1)
  })

  it('lifts the starting arsenal into week one models', () => {
    const a = myArsenal(migrateLeaderToCampaign(old))
    expect(a.models).toHaveLength(1)
    expect(a.models[0].addedWeek).toBe(1)
    expect(totalFor(a)).toBe(6)
  })

  it('returns null for nothing', () => {
    expect(migrateLeaderToCampaign(null)).toBeNull()
  })
})


describe('hireRules', () => {
  it('translates the stored name into the one hireCost reads', () => {
    expect(hireRules({ allowNegativeHireCost: true }).allowNegative).toBe(true)
  })

  it('defaults to flooring at zero, matching the documented house rule', () => {
    expect(hireRules({}).allowNegative).toBe(false)
    expect(hireRules().surchargeBeforeDiscount).toBe(true)
  })

  it('is what stops campaign.houseRules being passed in raw and doing nothing', () => {
    const stored = { allowNegativeHireCost: true, surchargeBeforeDiscount: false }
    // Raw, the key hireCost actually reads is absent:
    expect(stored.allowNegative).toBeUndefined()
    expect(hireRules(stored)).toEqual({ allowNegative: true, surchargeBeforeDiscount: false })
  })
})

describe('isOutOfKeyword', () => {
  const arsenal = ['bandit', 'foundry']

  it('is false when the model shares either keyword', () => {
    expect(isOutOfKeyword({ keywords: ['bandit'] }, arsenal)).toBe(false)
    expect(isOutOfKeyword({ keywords: ['foundry', 'wastrel'] }, arsenal)).toBe(false)
  })

  it('is true when it shares neither', () => {
    expect(isOutOfKeyword({ keywords: ['wastrel'] }, arsenal)).toBe(true)
  })

  it('treats a model with no keyword list as in-keyword rather than guessing', () => {
    expect(isOutOfKeyword({}, arsenal)).toBe(false)
    expect(isOutOfKeyword({ keywords: [] }, arsenal)).toBe(false)
  })

  it('ignores empty arsenal keyword slots', () => {
    expect(isOutOfKeyword({ keywords: ['bandit'] }, ['', ''])).toBe(false)
  })
})

describe('hiresInWeek', () => {
  it('returns only the models added that week', () => {
    const arsenal = { models: [
      { id: 'a', addedWeek: 1 }, { id: 'b', addedWeek: 2 }, { id: 'c', addedWeek: 2 },
    ] }
    expect(hiresInWeek(arsenal, 2).map((m) => m.id)).toEqual(['b', 'c'])
    expect(hiresInWeek(arsenal, 3)).toEqual([])
  })
})

describe('migrate — v1 to v2 model repair (audit M1)', () => {
  /* v1 let the creation wizard write bare {slug,name,cost} into
     arsenal.models. Injuries, annihilation and removal all key off `id`, so a
     starting model could not be hurt. These lock the repair down. */
  const v1 = {
    schemaVersion: 1,
    id: 'cmp_old',
    arsenals: [{
      id: 'ars_1',
      models: [
        { slug: 'swashbuckler', name: 'Swashbuckler', cost: 4 },
        { slug: 'skulker-skin', name: 'Skulker Skin', cost: 5 },
      ],
    }],
    localArsenalId: 'ars_1',
  }

  it('gives every model an id', () => {
    const models = migrate(v1).arsenals[0].models
    expect(models.every((m) => typeof m.id === 'string' && m.id.length > 0)).toBe(true)
    expect(new Set(models.map((m) => m.id)).size).toBe(2)
  })

  it('keeps what was already there', () => {
    const [first] = migrate(v1).arsenals[0].models
    expect(first).toMatchObject({ slug: 'swashbuckler', name: 'Swashbuckler', cost: 4 })
  })

  it('files them in week zero, so they are not counted as weekly hires', () => {
    // Week 1 would make the starting arsenal look like five hires and eat the
    // first-of-week discount for a genuine week-1 hire.
    expect(migrate(v1).arsenals[0].models.every((m) => m.addedWeek === 0)).toBe(true)
    expect(hiresInWeek(migrate(v1).arsenals[0], 1)).toEqual([])
  })

  it('backfills the fields injuries and annihilation depend on', () => {
    const [first] = migrate(v1).arsenals[0].models
    expect(first.annihilated).toBe(false)
    expect(first.scripPaid).toBe(0)
    expect(first).toHaveProperty('titleGroup')
  })

  it('stamps the current schema version', () => {
    expect(migrate(v1).schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('leaves an already-repaired model alone', () => {
    const good = createModel({ slug: 'x', name: 'X', cost: 3, addedWeek: 4 })
    const out = migrate({ ...v1, arsenals: [{ id: 'ars_1', models: [good] }] })
    expect(out.arsenals[0].models[0]).toBe(good)
  })

  it('is safe to run twice', () => {
    const once = migrate(v1)
    const twice = migrate(once)
    expect(twice.arsenals[0].models.map((m) => m.id)).toEqual(once.arsenals[0].models.map((m) => m.id))
  })

  it('survives a campaign with no arsenals or no models', () => {
    expect(migrate({ id: 'c', arsenals: [] }).arsenals).toEqual([])
    expect(migrate({ id: 'c', arsenals: [{ id: 'a' }] }).arsenals[0].models).toEqual([])
  })

  it('still returns null for nothing', () => {
    expect(migrate(null)).toBeNull()
  })
})
