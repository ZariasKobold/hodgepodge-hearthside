import { describe, it, expect } from 'vitest'
import {
  isLegacyCampaign, isV3Campaign, isV3Arsenal,
  repairModel, migrateArsenal, migrateLeaderToArsenal,
  splitLegacyCampaign, migrateCampaign, migrateShelf,
  bundle, readBundle, refileForImport, EXPORT_FORMAT,
} from './migrate.js'
import { createArsenal, createModel, STARTING_ARSENAL_WEEK, ARSENAL_SCHEMA_VERSION } from './arsenal.js'
import { createCampaign, createParticipation, CAMPAIGN_SCHEMA_VERSION } from './campaign.js'

/**
 * A v2 campaign as it actually sits in localStorage today: the leader, the
 * models, the scrip and the injuries all nested inside the campaign, with
 * `localArsenalId` naming the one that belongs to this device.
 */
function v2Campaign(patch = {}) {
  return {
    schemaVersion: 2,
    id: 'cmp_real',
    name: 'The Long Winter',
    weeksTotal: 12,
    startedAt: Date.UTC(2026, 0, 1),
    weekMode: 'calendar',
    weekOffset: 1,
    manualWeek: 1,
    houseRules: { allowNegativeHireCost: false, surchargeBeforeDiscount: true, weekLengthDays: 7 },
    joinCode: null,
    ownerUserId: 'u_owner',
    members: [],
    localArsenalId: 'ars_real',
    arsenals: [{
      id: 'ars_real',
      userId: null,
      displayName: '',
      faction: 'neverborn',
      keywords: ['nephilim', 'woe'],
      scrip: 7,
      leader: { name: 'Cletus', archetype: 'brute', size: 2, base: 30, advancements: [{ n: 1 }], experience: { boxesChecked: 3 } },
      crewCard: { effect: 'Expert Coordination', choice: '' },
      crewCardAdvancements: [],
      models: [
        { id: 'mdl_1', slug: 'terror-tot', name: 'Terror Tot', cost: 4, addedWeek: 0, scripPaid: 0, annihilated: false },
        { id: 'mdl_2', slug: 'nekima', name: 'Nekima', cost: 13, addedWeek: 2, scripPaid: 8, annihilated: false },
      ],
      injuries: [{ id: 'inj_1', name: 'Broken Arm', modelId: 'mdl_1', gainedWeek: 2, removedAt: null }],
      equipment: [{ id: 'eqp_1', equipmentId: 'pistol', name: 'Pistol', cc: 1, acquiredWeek: 2 }],
      totem: null,
    }],
    games: [
      { id: 'gam_1', arsenalId: 'ars_real', opponentArsenalId: null, week: 2, result: 'win', vpSelf: 5, killedModelIds: ['mdl_1'], aftermath: { phase: 'payday', done: false } },
    ],
    updatedAt: 1234,
    ...patch,
  }
}

describe('recognising a document', () => {
  it('tells the three shapes apart', () => {
    expect(isLegacyCampaign(v2Campaign())).toBe(true)
    expect(isV3Campaign(v2Campaign())).toBe(false)
    expect(isV3Campaign(createCampaign())).toBe(true)
    expect(isV3Arsenal(createArsenal())).toBe(true)
    expect(isV3Arsenal(createCampaign())).toBe(false)
    expect(isLegacyCampaign(null)).toBe(false)
  })
})

describe('splitLegacyCampaign', () => {
  const { campaign, arsenals } = splitLegacyCampaign(v2Campaign())
  const [arsenal] = arsenals

  it('produces one campaign and one arsenal', () => {
    expect(arsenals).toHaveLength(1)
    expect(campaign.schemaVersion).toBe(CAMPAIGN_SCHEMA_VERSION)
    expect(arsenal.schemaVersion).toBe(ARSENAL_SCHEMA_VERSION)
  })

  it('preserves both ids, so the D1 rows that already exist line up', () => {
    // Re-minting here would double every row on the server the first time a
    // device synced after upgrading. `arsenals` has had its own id since 0001.
    expect(campaign.id).toBe('cmp_real')
    expect(arsenal.id).toBe('ars_real')
  })

  it('moves everything personal out of the campaign', () => {
    expect(campaign.arsenals).toBeUndefined()
    expect(campaign.localArsenalId).toBeUndefined()
    expect(campaign.members).toBeUndefined()
    expect(campaign.joinCode).toBeUndefined()
  })

  it('leaves the table intact — weeks, mode, house rules, games', () => {
    expect(campaign.name).toBe('The Long Winter')
    expect(campaign.weeksTotal).toBe(12)
    expect(campaign.weekOffset).toBe(1)
    expect(campaign.startedAt).toBe(Date.UTC(2026, 0, 1))
    expect(campaign.houseRules.weekLengthDays).toBe(7)
    expect(campaign.games).toHaveLength(1)
    expect(campaign.games[0].aftermath).toEqual({ phase: 'payday', done: false })
    expect(campaign.games[0].arsenalId).toBe('ars_real')
  })

  it('carries the whole arsenal across, nothing dropped', () => {
    expect(arsenal.faction).toBe('neverborn')
    expect(arsenal.keywords).toEqual(['nephilim', 'woe'])
    expect(arsenal.scrip).toBe(7)
    expect(arsenal.leader.name).toBe('Cletus')
    expect(arsenal.leader.experience.boxesChecked).toBe(3)
    expect(arsenal.leader.advancements).toEqual([{ n: 1 }])
    expect(arsenal.crewCard.effect).toBe('Expert Coordination')
    expect(arsenal.models.map((m) => m.id)).toEqual(['mdl_1', 'mdl_2'])
    expect(arsenal.injuries).toHaveLength(1)
    expect(arsenal.equipment).toHaveLength(1)
  })

  it('seats the arsenal at the table it came out of', () => {
    expect(arsenal.campaignId).toBe('cmp_real')
    expect(campaign.participants).toHaveLength(1)
    expect(campaign.participants[0]).toMatchObject({
      arsenalId: 'ars_real', userId: 'u_owner', role: 'host', status: 'active', joinedWeek: 1,
    })
  })

  it('carries ownership onto the arsenal, which used to have none', () => {
    expect(arsenal.ownerUserId).toBe('u_owner')
    expect(campaign.ownerUserId).toBe('u_owner')
  })

  it('leaves an unclaimed campaign unclaimed, so signing in can still adopt it', () => {
    const loose = splitLegacyCampaign(v2Campaign({ ownerUserId: null }))
    expect(loose.campaign.ownerUserId).toBeNull()
    expect(loose.arsenals[0].ownerUserId).toBeNull()
    expect(loose.campaign.participants[0].userId).toBeNull()
  })

  it('keeps a second nested arsenal rather than dropping it', () => {
    // Nothing in the client has ever written one, but `arsenals[]` was
    // documented as being for other players. If one is there, it survives.
    const doc = v2Campaign()
    doc.arsenals.push({ id: 'ars_theirs', leader: { name: 'Their Leader' }, models: [{ id: 'x', name: 'Ox', cost: 6 }] })
    const out = splitLegacyCampaign(doc)
    expect(out.arsenals.map((a) => a.id)).toEqual(['ars_real', 'ars_theirs'])
    const theirs = out.campaign.participants.find((p) => p.arsenalId === 'ars_theirs')
    expect(theirs.role).toBe('opponent')
    // A typed-in opponent has no account behind them and must not be handed one.
    expect(theirs.userId).toBeNull()
  })
})

describe('the v1 model repair, carried forward', () => {
  it('gives a bare wizard-written model an id and files it under the starting arsenal', () => {
    const bare = { slug: 'tot', name: 'Terror Tot', cost: 4 }
    const fixed = repairModel(bare)
    expect(fixed.id).toBeTruthy()
    expect(fixed.addedWeek).toBe(STARTING_ARSENAL_WEEK)
    expect(fixed.annihilated).toBe(false)
  })
  it('leaves a model that already has an id exactly as it is', () => {
    const m = createModel({ id: 'mdl_1', addedWeek: 3 })
    expect(repairModel(m)).toBe(m)
  })
  it('repairs models on the way through the split', () => {
    const doc = v2Campaign()
    doc.arsenals[0].models = [{ slug: 'tot', name: 'Terror Tot', cost: 4 }]
    const { arsenals } = splitLegacyCampaign(doc)
    expect(arsenals[0].models[0].id).toBeTruthy()
    expect(arsenals[0].models[0].addedWeek).toBe(STARTING_ARSENAL_WEEK)
  })
})

describe('migrateCampaign', () => {
  it('is the one door for either shape', () => {
    expect(migrateCampaign(v2Campaign()).arsenals).toHaveLength(1)
    expect(migrateCampaign(createCampaign()).arsenals).toEqual([])
    expect(migrateCampaign(null)).toBeNull()
  })
  it('is safe to run twice — a v3 campaign comes back unchanged', () => {
    const once = migrateCampaign(v2Campaign()).campaign
    const twice = migrateCampaign(once).campaign
    expect(twice).toEqual(once)
  })
  it('is safe to run twice on an arsenal too', () => {
    const once = migrateArsenal(v2Campaign().arsenals[0], { ownerUserId: 'u1', campaignId: 'cmp_real' })
    const twice = migrateArsenal(once)
    expect(twice).toEqual(once)
  })
})

describe('migrateShelf', () => {
  it('lifts a whole shelf into two collections', () => {
    const { campaigns, arsenals } = migrateShelf([
      v2Campaign(),
      v2Campaign({ id: 'cmp_two', localArsenalId: 'ars_two', arsenals: [{ id: 'ars_two', leader: { name: 'Second' }, models: [] }] }),
    ])
    expect(campaigns.map((c) => c.id)).toEqual(['cmp_real', 'cmp_two'])
    expect(arsenals.map((a) => a.id)).toEqual(['ars_real', 'ars_two'])
  })
  it('does NOT merge one person\'s several campaigns into one table', () => {
    // Merging would mean guessing that two leaders played together, and picking
    // a winner between two week counts. That is the shape of every bug here.
    const { campaigns } = migrateShelf([v2Campaign(), v2Campaign({ id: 'cmp_two' })])
    expect(campaigns).toHaveLength(2)
  })
  it('deduplicates by id, so a doubled shelf entry is not doubled on the server', () => {
    const { campaigns, arsenals } = migrateShelf([v2Campaign(), v2Campaign()])
    expect(campaigns).toHaveLength(1)
    expect(arsenals).toHaveLength(1)
  })
  it('survives rubbish in the list', () => {
    expect(migrateShelf([null, undefined]).campaigns).toEqual([])
  })
})

describe('migrateLeaderToArsenal', () => {
  it('lifts the v0.1 single leader, splitting arsenal fields off the leader', () => {
    const a = migrateLeaderToArsenal({
      name: 'Cletus', archetype: 'brute', faction: 'neverborn', keywords: ['nephilim', 'woe'],
      scrip: 2, arsenal: [{ slug: 'tot', name: 'Terror Tot', cost: 4 }],
      crewCard: { effect: 'Expert Coordination', choice: '' },
    })
    expect(a.faction).toBe('neverborn')
    expect(a.keywords).toEqual(['nephilim', 'woe'])
    expect(a.scrip).toBe(2)
    expect(a.leader.name).toBe('Cletus')
    expect(a.leader.faction).toBeUndefined()
    expect(a.models[0].addedWeek).toBe(STARTING_ARSENAL_WEEK)
    expect(a.models[0].id).toBeTruthy()
    expect(a.campaignId).toBeNull()
  })
  it('returns null for nothing', () => {
    expect(migrateLeaderToArsenal(null)).toBeNull()
  })
})

describe('readBundle', () => {
  // Every shape this app has ever exported has to come back in. An export this
  // app cannot read is not a rescue (audit v0.11.0, H2/H3).
  it('reads a bare v2 campaign — the original single-campaign export', () => {
    const out = readBundle(v2Campaign())
    expect(out.campaigns).toHaveLength(1)
    expect(out.arsenals).toHaveLength(1)
  })
  it('reads an array of them', () => {
    const out = readBundle([v2Campaign(), v2Campaign({ id: 'cmp_two' })])
    expect(out.campaigns).toHaveLength(2)
  })
  it('reads the shelf rescue from the sign-in gate', () => {
    const out = readBundle({ campaigns: [v2Campaign()] })
    expect(out.campaigns).toHaveLength(1)
    expect(out.arsenals[0].id).toBe('ars_real')
  })
  it('reads a v3 bundle back', () => {
    const { campaigns, arsenals } = migrateShelf([v2Campaign()])
    const file = bundle({ campaigns, arsenals })
    expect(file.format).toBe(EXPORT_FORMAT)
    const out = readBundle(file)
    expect(out.campaigns.map((c) => c.id)).toEqual(['cmp_real'])
    expect(out.arsenals.map((a) => a.id)).toEqual(['ars_real'])
  })
  it('reads a lone arsenal, which is a whole sheet on its own', () => {
    const out = readBundle(createArsenal({ id: 'ars_solo', displayName: 'Cletus' }))
    expect(out.campaigns).toEqual([])
    expect(out.arsenals.map((a) => a.id)).toEqual(['ars_solo'])
  })
  it('reads nothing out of nothing', () => {
    expect(readBundle(null)).toEqual({ campaigns: [], arsenals: [] })
  })
})

describe('refileForImport', () => {
  const source = migrateShelf([v2Campaign()])
  const filed = refileForImport(source)

  it('mints new top-level ids, so importing files rather than overwrites', () => {
    expect(filed.campaigns[0].id).not.toBe('cmp_real')
    expect(filed.arsenals[0].id).not.toBe('ars_real')
    // Importing the same export twice gives two of everything.
    const again = refileForImport(source)
    expect(again.campaigns[0].id).not.toBe(filed.campaigns[0].id)
  })

  it('repoints every link inside the file', () => {
    const c = filed.campaigns[0]
    const a = filed.arsenals[0]
    expect(a.campaignId).toBe(c.id)
    expect(c.participants[0].arsenalId).toBe(a.id)
    expect(c.games[0].arsenalId).toBe(a.id)
  })

  it('keeps the model ids, which nothing outside the arsenal refers to', () => {
    expect(filed.arsenals[0].models.map((m) => m.id)).toEqual(['mdl_1', 'mdl_2'])
    expect(filed.campaigns[0].games[0].killedModelIds).toEqual(['mdl_1'])
    expect(filed.arsenals[0].injuries[0].modelId).toBe('mdl_1')
  })

  it('strips ownership, so the first sign-in adopts by the ordinary path', () => {
    expect(filed.campaigns[0].ownerUserId).toBeNull()
    expect(filed.arsenals[0].ownerUserId).toBeNull()
  })

  it('drops account ids from the participations and keeps the nicknames', () => {
    // The nickname is the only identity that crosses. A user id outlives the
    // campaign and correlates an arsenal to a person forever.
    const withPeople = {
      campaigns: [createCampaign({
        id: 'cmp_x',
        participants: [createParticipation({ userId: 'u_them', arsenalId: 'ars_x', nickname: 'Jill' })],
      })],
      arsenals: [createArsenal({ id: 'ars_x', campaignId: 'cmp_x' })],
    }
    const out = refileForImport(withPeople)
    expect(out.campaigns[0].participants[0].userId).toBeNull()
    expect(out.campaigns[0].participants[0].nickname).toBe('Jill')
  })

  it('detaches an arsenal whose campaign is not in the file', () => {
    // That id may name somebody else's campaign on this device, or nothing at
    // all. A dangling pointer is worse than an arsenal waiting to be seated.
    const out = refileForImport({
      campaigns: [],
      arsenals: [createArsenal({ id: 'ars_orphan', campaignId: 'cmp_elsewhere' })],
    })
    expect(out.arsenals[0].campaignId).toBeNull()
  })

  it('leaves the source untouched', () => {
    expect(source.campaigns[0].id).toBe('cmp_real')
    expect(source.arsenals[0].id).toBe('ars_real')
  })
})

describe('a whole round trip', () => {
  it('exports v2 work, imports it back, and every number survives', () => {
    const lifted = migrateShelf([v2Campaign()])
    const file = JSON.parse(JSON.stringify(bundle(lifted)))
    const filed = refileForImport(readBundle(file))

    const a = filed.arsenals[0]
    const c = filed.campaigns[0]
    expect(a.scrip).toBe(7)
    expect(a.leader.name).toBe('Cletus')
    expect(a.leader.experience.boxesChecked).toBe(3)
    expect(a.models).toHaveLength(2)
    expect(a.injuries).toHaveLength(1)
    expect(a.equipment).toHaveLength(1)
    expect(c.weeksTotal).toBe(12)
    expect(c.weekOffset).toBe(1)
    expect(c.games[0].aftermath.phase).toBe('payday')
    expect(c.participants[0].arsenalId).toBe(a.id)
  })
})
