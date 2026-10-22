import { describe, it, expect } from 'vitest'
import { fullArsenalExport, fullExportFilename, subjectsOf, FULL_EXPORT_KIND } from './arsenalExport.js'
import {
  createArsenal, createLeader, createModel, createInjury, createEquipment, createTotem,
  STARTING_ARSENAL_WEEK,
} from './shape/arsenal.js'
import { createCampaign, createGame, createParticipation } from './shape/campaign.js'
import { readBundle, EXPORT_FORMAT } from './shape/migrate.js'

/**
 * Built to look like the file the Adjudicator Engine could not read: a game
 * whose killed and hired lists are bare model ids, an advancement that says
 * only `leader`, and a starting arsenal that no aftermath ever mentions.
 */
function fixture() {
  const swash = createModel({ id: 'mdl_swash', name: 'Swashbuckler', slug: 'swashbuckler', cost: 6, addedWeek: STARTING_ARSENAL_WEEK })
  const sentinel = createModel({ id: 'mdl_sentinel', name: 'Shorebound Sentinel', cost: 7, addedWeek: 1, scripPaid: 2 })
  const dead = createModel({ id: 'mdl_dead', name: 'Lost Love', cost: 5, addedWeek: 2, scripPaid: 5, annihilated: true })
  const arsenal = createArsenal({
    id: 'ars_test',
    campaignId: 'cmp_test',
    faction: 'ten-thunders',
    keywords: ['last-blossom', ''],
    scrip: 4,
    startingScripGranted: 2,
    leader: createLeader({
      name: 'Cletus and Duke',
      archetype: 'heavy_hitter',
      representingModel: 'Wandering River',
      picks: {
        attack: [{ key: 'yasunori::attack::Katana', name: 'Katana', model: { slug: 'yasunori', name: 'Yasunori', cost: 8 }, triggers: [] }],
        tactical: [{ key: 'manual::Low River Monk::Hop', name: 'Hop', model: 'Low River Monk', cost: 4, triggers: [], manual: true }],
        ability: [],
      },
      experience: { boxesChecked: 3 },
      advancements: [{ id: 'adv_1', tableId: 'attack', tableValue: 3, name: 'Skill Boost', page: 38, appliesTo: { key: 'yasunori::attack::Katana', name: 'Katana' } }],
    }),
    crewCard: { effect: 'heavy_blow', choice: '' },
    models: [swash, sentinel, dead],
    injuries: [
      createInjury({ id: 'inj_skin', name: 'Skulker Skin', modelId: 'mdl_sentinel', gainedWeek: 2 }),
      createInjury({ id: 'inj_leader', name: 'Bad Knee', gainedWeek: 1 }),
      createInjury({ id: 'inj_healed', name: 'Black Eye', modelId: 'mdl_swash', removedAt: 123 }),
    ],
    equipment: [
      createEquipment({ id: 'eqp_gun', equipmentId: 'gatling_gun', name: 'Gatling Gun', cc: 2, page: 24, acquiredWeek: 1 }),
      createEquipment({ id: 'eqp_foot', name: 'Lucky Gremlin Foot', cc: 1, annihilated: true, annihilatedWeek: 2 }),
    ],
    totem: createTotem({ id: 'ttm_1', name: 'Mini-Master' }),
  })
  const campaign = createCampaign({
    id: 'cmp_test',
    name: 'The Long Road',
    weekMode: 'manual',
    manualWeek: 3,
    participants: [createParticipation({ arsenalId: 'ars_test', nickname: 'Dalton' })],
    games: [
      createGame({
        id: 'gam_1', arsenalId: 'ars_test', week: 2, result: 'win', vpSelf: 4, vpOpponent: 3,
        hiredModelIds: ['mdl_swash', 'mdl_dead'],
        killedModelIds: ['mdl_dead'],
        equipmentHired: [
          { equipmentId: 'gatling_gun', rowId: 'eqp_gun', modelId: null, holder: 'leader' },
          { equipmentId: null, rowId: 'eqp_foot', modelId: 'mdl_swash', holder: 'mdl_swash' },
        ],
      }),
      createGame({ id: 'gam_other', arsenalId: 'ars_someone_else', week: 2 }),
      createGame({ id: 'gam_manual', arsenalId: 'ars_test', week: 1, equipmentHired: [undefined] }),
    ],
  })
  return { arsenal, campaign }
}

describe('fullArsenalExport', () => {
  it('is a bundle this app reads back, documents untouched', () => {
    const { arsenal, campaign } = fixture()
    const file = JSON.parse(JSON.stringify(fullArsenalExport({ arsenal, campaign })))
    expect(file.format).toBe(EXPORT_FORMAT)
    expect(file.kind).toBe(FULL_EXPORT_KIND)
    expect(file.arsenals).toEqual([JSON.parse(JSON.stringify(arsenal))])
    expect(file.campaigns).toEqual([JSON.parse(JSON.stringify(campaign))])

    const back = readBundle(file)
    expect(back.arsenals.map((a) => a.id)).toEqual(['ars_test'])
    expect(back.campaigns.map((c) => c.id)).toEqual(['cmp_test'])
    expect(back.arsenals[0].models).toHaveLength(3)
  })

  it('names the leader: archetype, stat line, faction, keywords, and where each pick came from', () => {
    const { arsenal, campaign } = fixture()
    const { leader } = fullArsenalExport({ arsenal, campaign })
    expect(leader.name).toBe('Cletus and Duke')
    expect(leader.archetype).toEqual({ id: 'heavy_hitter', name: 'Heavy Hitter', page: 17 })
    expect(leader.stats).toEqual({ df: 6, wp: 4, sp: 6, health: 14 })
    expect(leader.faction).toEqual({ slug: 'ten-thunders', name: expect.any(String) })
    expect(leader.keywords).toEqual(['last-blossom'])
    expect(leader.representingModel).toBe('Wandering River')
    expect(leader.picks.attack[0]).toMatchObject({ name: 'Katana', fromModel: 'Yasunori', fromSlug: 'yasunori', manual: false })
    expect(leader.picks.tactical[0]).toMatchObject({ name: 'Hop', fromModel: 'Low River Monk', fromSlug: null, manual: true })
    expect(leader.crewCard.effect.name).toBe('Heavy Blow')
    expect(leader.advancements[0]).toMatchObject({ name: 'Skill Boost', table: 'Attack Modification', tier: 1 })
    expect(leader.injuries.map((i) => i.name)).toEqual(['Bad Knee'])
  })

  it('lists every model by name, starting arsenal and the dead included', () => {
    const { arsenal, campaign } = fixture()
    const { roster } = fullArsenalExport({ arsenal, campaign })
    expect(roster.map((m) => m.name)).toEqual(['Swashbuckler', 'Shorebound Sentinel', 'Lost Love'])
    expect(roster[0].startingArsenal).toBe(true)
    expect(roster[1].injuries.map((i) => i.name)).toEqual(['Skulker Skin'])
    // A healed injury is history, not current state.
    expect(roster[0].injuries).toEqual([])
    expect(roster[2].annihilated).toBe(true)
  })

  it('states the current position rather than leaving it to a replay', () => {
    const { arsenal, campaign } = fixture()
    const file = fullArsenalExport({ arsenal, campaign })
    expect(file.state).toMatchObject({ scrip: 4, startingScripGranted: 2, soulstones: 13, modelCount: 2, week: 3 })
    expect(file.equipment.map((e) => [e.name, e.held])).toEqual([['Gatling Gun', true], ['Lucky Gremlin Foot', false]])
    const active = file.injuries.filter((i) => i.active)
    expect(active.map((i) => [i.name, i.on.name])).toEqual([['Skulker Skin', 'Shorebound Sentinel'], ['Bad Knee', 'Cletus and Duke']])
  })

  it('turns the ids in a game back into names', () => {
    const { arsenal, campaign } = fixture()
    const { campaign: c } = fullArsenalExport({ arsenal, campaign })
    expect(c.games.map((g) => g.id)).toEqual(['gam_1', 'gam_manual'])
    const [game] = c.games
    expect(game.hired).toEqual([{ id: 'mdl_swash', name: 'Swashbuckler' }, { id: 'mdl_dead', name: 'Lost Love' }])
    expect(game.killed).toEqual([{ id: 'mdl_dead', name: 'Lost Love' }])
    expect(game.equipmentHired).toEqual([
      { equipmentId: 'gatling_gun', equipment: 'Gatling Gun', holder: { id: 'leader', name: 'Cletus and Duke' } },
      { equipmentId: null, equipment: 'Lucky Gremlin Foot', holder: { id: 'mdl_swash', name: 'Swashbuckler' } },
    ])
    expect(c.games[1].equipmentHired).toEqual([{ equipmentId: null, equipment: null, holder: null }])
    expect(c.gamesWon).toBe(1)
  })

  it('carries one lookup from every id to who it is', () => {
    const { arsenal } = fixture()
    const subjects = subjectsOf(arsenal)
    expect(subjects.leader.name).toBe('Cletus and Duke')
    expect(subjects.mdl_dead).toMatchObject({ kind: 'model', name: 'Lost Love', annihilated: true })
    expect(subjects.ttm_1).toMatchObject({ kind: 'totem', name: 'Mini-Master' })
    expect(subjects.eqp_gun).toMatchObject({ kind: 'equipment', name: 'Gatling Gun' })
    expect(subjects.inj_skin).toMatchObject({ kind: 'injury', name: 'Skulker Skin' })
  })

  it('exports an arsenal that is not at a table', () => {
    const { arsenal } = fixture()
    const file = fullArsenalExport({ arsenal: { ...arsenal, campaignId: null } })
    expect(file.campaigns).toEqual([])
    expect(file.campaign).toBeNull()
    expect(file.state.week).toBeNull()
    expect(readBundle(file).arsenals).toHaveLength(1)
  })

  it('carries no rules text', () => {
    const { arsenal, campaign } = fixture()
    const { campaigns, arsenals, ...resolved } = fullArsenalExport({ arsenal, campaign })
    expect(JSON.stringify(resolved)).not.toMatch(/"(description|text)"/)
  })

  it('refuses to export nothing', () => {
    expect(() => fullArsenalExport({ arsenal: null })).toThrow()
  })
})

describe('fullExportFilename', () => {
  it('slugs the leader name', () => {
    expect(fullExportFilename({ leader: { name: 'Cletus & Duke!' } })).toBe('cletus-duke-arsenal.json')
    expect(fullExportFilename({ leader: { name: '' } })).toBe('leader-arsenal.json')
  })
})
