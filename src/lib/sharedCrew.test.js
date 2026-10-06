import { describe, it, expect } from 'vitest'
import {
  crewSummary, sessionFor, invitations, sessionStage, ratingPatch, sizeDisagreement,
} from './sharedCrew.js'
import { createEncounter, LEADER, TOTEM } from './encounter.js'
import {
  createArsenal, createLeader, createModel, createEquipment, createInjury, createTotem,
} from './shape/arsenal.js'

const leader = createLeader({ name: 'Cletus', advancements: [{ id: 'a1' }, { id: 'a2' }] })
const arsenal = createArsenal({
  id: 'ars_me',
  keywords: ['angler', 'banished'],
  leader,
  models: [
    createModel({ id: 'm1', name: 'Shorebound Sentinel', cost: 5 }),
    createModel({ id: 'm2', name: 'Silent Siren', cost: 7, keywords: ['tidal'] }),
  ],
  equipment: [
    createEquipment({ id: 'e1', equipmentId: 'duplicator', name: 'Duplicator' }),
    createEquipment({ id: 'e2', equipmentId: 'false-face', name: 'False Face' }),
  ],
  injuries: [createInjury({ name: 'Pack Mule', modelId: 'm1' })],
  totem: createTotem({ name: 'Willing Vessel' }),
})

const session = (over = {}) => ({
  id: 'shr_1', week: 4,
  mine: { arsenalId: 'ars_me', revealed: false, crew: null },
  theirs: { arsenalId: 'ars_fish', nickname: 'Fish', leader: 'Tukala', revealed: false, left: false, crew: null },
  ...over,
})

describe('crewSummary', () => {
  it('names everything, by name, with no ids', () => {
    const e = createEncounter({
      modelIds: ['m1', 'm2'], totem: true, strategy: 'Plant Explosives',
      opponent: { arsenalTotal: 30 },
      equipment: [{ rowId: 'e1', holder: 'm1' }, { rowId: 'e2', holder: LEADER }],
    })
    const s = crewSummary(e, arsenal, leader)
    expect(s).toEqual({
      leader: 'Cletus',
      totem: 'Willing Vessel',
      models: [
        { name: 'Shorebound Sentinel', cost: 5, taxed: false },
        { name: 'Silent Siren', cost: 8, taxed: true },
      ],
      equipment: [
        { name: 'Duplicator', holder: 'Shorebound Sentinel' },
        { name: 'False Face', holder: 'Cletus' },
      ],
      cost: 13,
      rating: 3,          // 2 kit + 2 advancements − 1 Sentinel injury
      encounterSize: 18,  // 12ss arsenal plus six
      strategy: 'Plant Explosives',
    })
    expect(JSON.stringify(s)).not.toMatch(/"m1"|"e1"|ars_me/)
  })

  it('names kit on the totem by the totem', () => {
    const e = createEncounter({ totem: true, equipment: [{ rowId: 'e1', holder: TOTEM }] })
    expect(crewSummary(e, arsenal, leader).equipment).toEqual([{ name: 'Duplicator', holder: 'Willing Vessel' }])
  })
})

describe('sessions in the player\'s terms', () => {
  it('finds the session a local crew belongs to', () => {
    expect(sessionFor({ sharedId: 'shr_1' }, [session()]).id).toBe('shr_1')
    expect(sessionFor({}, [session()])).toBeNull()
  })

  it('offers only sessions this device is not already hiring for', () => {
    const campaign = { encounters: [{ sharedId: 'shr_1' }] }
    expect(invitations([session(), session({ id: 'shr_2' })], campaign).map((s) => s.id)).toEqual(['shr_2'])
  })

  it('says where a session stands', () => {
    expect(sessionStage(null)).toBe('gone')
    expect(sessionStage(session())).toBe('hiring')
    expect(sessionStage(session({ theirs: { ...session().theirs, revealed: true } }))).toBe('theirs-ready')
    expect(sessionStage(session({ mine: { revealed: true } }))).toBe('waiting')
    expect(sessionStage(session({ mine: { revealed: true }, theirs: { revealed: true } }))).toBe('both')
    expect(sessionStage(session({ theirs: { left: true } }))).toBe('left')
    // Their crew stays readable after they record the game.
    expect(sessionStage(session({ mine: { revealed: true }, theirs: { revealed: true, left: true } }))).toBe('both')
  })
})

describe('after both reveal', () => {
  const both = session({
    mine: { revealed: true },
    theirs: { ...session().theirs, revealed: true, crew: { rating: -1, encounterSize: 25 } },
  })

  it('fills in their rating, once', () => {
    const e = createEncounter({ opponent: { name: 'Fish', rating: null } })
    expect(ratingPatch(e, both)).toEqual({ opponent: { name: 'Fish', rating: '-1' } })
    expect(ratingPatch({ ...e, opponent: { rating: '2' } }, both)).toBeNull()
    expect(ratingPatch(e, session())).toBeNull()
  })

  it('says when the two sides hired to different sizes', () => {
    const e = createEncounter({ encounterSize: 30 })
    expect(sizeDisagreement(e, arsenal, both)).toEqual({ mine: 30, theirs: 25 })
    expect(sizeDisagreement({ ...e, encounterSize: 25 }, arsenal, both)).toBeNull()
  })
})
