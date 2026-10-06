import { describe, it, expect } from 'vitest'
import {
  createEncounter, openEncounter, crewCost, encounterCap, encounterSizeOf,
  hiredEquipment, crewInjuryCount, crewRating, poolFor, encounterProblems,
  encounterReady, toggleModel, toggleTotem, toggleTax, attachEquipment,
  gameFieldsFrom, LEADER, TOTEM,
} from './encounter.js'
import {
  createArsenal, createLeader, createModel, createEquipment, createInjury, createTotem,
} from './shape/arsenal.js'

/**
 * Built through the real `create*` functions, so the fixtures carry exactly the
 * fields a real arsenal does and no friendlier ones (the lesson of v0.22.4,
 * v0.24.0 and audit v0.28.1 M2 / L5).
 *
 * Arsenal: 4 + 5 + 7 + 3 = 19ss live, plus an annihilated 6.
 */
function arsenalFixture(over = {}) {
  return createArsenal({
    id: 'ars_me',
    keywords: ['angler', 'banished'],
    leader: createLeader({
      name: 'Cletus',
      advancements: [{ id: 'adv_1', name: 'Skill Boost' }, { id: 'adv_2', name: 'Heavy Fall' }],
    }),
    models: [
      createModel({ id: 'm_swash', name: 'Swashbuckler', cost: 4 }),
      createModel({ id: 'm_sent', name: 'Shorebound Sentinel', cost: 5 }),
      createModel({ id: 'm_siren', name: 'Silent Siren', cost: 7 }),
      createModel({ id: 'm_peon', name: 'Peon', cost: 3, peon: true }),
      createModel({ id: 'm_dead', name: 'Skulker Skin', cost: 6, annihilated: true }),
    ],
    equipment: [
      createEquipment({ id: 'eq_dup', equipmentId: 'duplicator', name: 'Duplicator', cc: 3 }),
      createEquipment({ id: 'eq_face', equipmentId: 'false-face', name: 'False Face', cc: 2 }),
      createEquipment({ id: 'eq_gone', equipmentId: 'coffee', name: 'Coffee', cc: 1, annihilated: true }),
    ],
    injuries: [
      createInjury({ id: 'i_lead', name: 'Leadfooted' }),                     // the leader
      createInjury({ id: 'i_sent', name: 'Pack Mule', modelId: 'm_sent' }),
      createInjury({ id: 'i_siren', name: 'Senseless', modelId: 'm_siren' }),
      createInjury({ id: 'i_old', name: 'Off Balance', modelId: 'm_swash', removedAt: 5 }),
    ],
    totem: createTotem({ name: 'Willing Vessel', advancements: [{ id: 'adv_t' }] }),
    ...over,
  })
}

const enc = (over = {}) => createEncounter({ arsenalId: 'ars_me', week: 3, ...over })

describe('createEncounter', () => {
  it('starts hiring, with only the leader in the crew', () => {
    const e = enc()
    expect(e.status).toBe('hiring')
    expect(e.modelIds).toEqual([])
    expect(e.totem).toBe(false)
    expect(e.id).toMatch(/^enc_/)
  })

  it('finds the open one for this arsenal and not a played one', () => {
    const open = enc({ id: 'enc_open' })
    const played = enc({ id: 'enc_old', status: 'played' })
    const other = enc({ id: 'enc_other', arsenalId: 'ars_them' })
    expect(openEncounter({ encounters: [played, other, open] }, 'ars_me').id).toBe('enc_open')
    expect(openEncounter({}, 'ars_me')).toBeNull()
  })
})

describe('cost and size (p. 19)', () => {
  it('charges the models hired, and nothing for leader or totem', () => {
    const a = arsenalFixture()
    expect(crewCost(enc({ modelIds: ['m_swash', 'm_siren'], totem: true }), a)).toBe(11)
  })

  it('adds 1 for each model the player marks out of keyword', () => {
    const a = arsenalFixture()
    expect(crewCost(enc({ modelIds: ['m_swash', 'm_siren'], taxed: ['m_siren'] }), a)).toBe(12)
  })

  it('never charges for an annihilated model, which is not in the arsenal', () => {
    const a = arsenalFixture()
    expect(crewCost(enc({ modelIds: ['m_dead'] }), a)).toBe(0)
  })

  it('caps at the smaller arsenal plus six, from live models only', () => {
    const a = arsenalFixture()             // 19ss live
    expect(encounterCap(a, 35)).toBe(25)
    expect(encounterCap(a, 12)).toBe(18)
    expect(encounterCap(a, null)).toBeNull()
    expect(encounterCap(a, '')).toBeNull()
  })

  it('hires to the agreed size, or to the cap when none was agreed', () => {
    const a = arsenalFixture()
    expect(encounterSizeOf(enc({ opponent: { arsenalTotal: 35 } }), a)).toBe(25)
    expect(encounterSizeOf(enc({ opponent: { arsenalTotal: 35 }, encounterSize: 20 }), a)).toBe(20)
    expect(encounterSizeOf(enc(), a)).toBeNull()
  })
})

describe('the campaign rating counts the hired crew (owner decision, Session 74)', () => {
  it('counts only kit on somebody in the crew, and never annihilated kit', () => {
    const a = arsenalFixture()
    const e = enc({
      modelIds: ['m_swash'],
      equipment: [
        { rowId: 'eq_dup', holder: 'm_swash' },
        { rowId: 'eq_face', holder: 'm_siren' },   // not hired
        { rowId: 'eq_gone', holder: LEADER },     // annihilated
      ],
    })
    expect(hiredEquipment(e, a).map((x) => x.rowId)).toEqual(['eq_dup'])
  })

  it('counts the leader and the hired models\' injuries, not the bench', () => {
    const a = arsenalFixture()
    expect(crewInjuryCount(enc({ modelIds: [] }), a)).toBe(1)
    expect(crewInjuryCount(enc({ modelIds: ['m_sent'] }), a)).toBe(2)
    // Swashbuckler's only injury was healed.
    expect(crewInjuryCount(enc({ modelIds: ['m_swash'] }), a)).toBe(1)
  })

  it('counts a titled group once, however many versions are hired', () => {
    const a = arsenalFixture({
      models: [
        createModel({ id: 't1', name: 'Titled', cost: 8, titleGroup: 'tg' }),
        createModel({ id: 't2', name: 'Titled, Later', cost: 9, titleGroup: 'tg' }),
      ],
      injuries: [createInjury({ id: 'i_tg', name: 'Pack Mule', titleGroup: 'tg' })],
    })
    expect(crewInjuryCount(enc({ modelIds: ['t1', 't2'] }), a)).toBe(1)
  })

  it('is kit + leader and totem advancements − injuries in the crew', () => {
    const a = arsenalFixture()
    const e = enc({
      modelIds: ['m_sent'],
      totem: true,
      equipment: [{ rowId: 'eq_dup', holder: 'm_sent' }, { rowId: 'eq_face', holder: TOTEM }],
    })
    // 2 kit + 2 leader + 1 totem − (1 leader + 1 Sentinel) = 3
    expect(crewRating(e, a)).toBe(3)
  })

  it('leaves a totem at home with its advancements and its kit', () => {
    const a = arsenalFixture()
    const e = enc({ equipment: [{ rowId: 'eq_face', holder: TOTEM }] })
    // 0 kit + 2 leader + 0 totem − 1 leader injury
    expect(crewRating(e, a)).toBe(1)
  })
})

describe('the soulstone pool', () => {
  it('takes the leftover to six, and the lower crew adds up to three', () => {
    const a = arsenalFixture()
    // cap 25, spend 4 → 21 left, 6 reach the pool.
    const e = enc({ modelIds: ['m_swash'], opponent: { arsenalTotal: 35, rating: 6 } })
    const p = poolFor(e, a)
    expect(p.leftover).toBe(21)
    expect(p.fromHire).toBe(6)
    expect(p.lostOverMax).toBe(15)
    // my rating: 0 kit + 2 − 1 = 1; theirs 6 → bonus capped at 3, past six.
    expect(p.bonus).toBe(3)
    expect(p.total).toBe(9)
  })

  it('does not pretend to know the bonus without their rating', () => {
    const a = arsenalFixture()
    const p = poolFor(enc({ opponent: { arsenalTotal: 35 } }), a)
    expect(p.bonus).toBeNull()
    expect(p.total).toBeNull()
  })

  it('is unknown with no encounter size', () => {
    expect(poolFor(enc(), arsenalFixture())).toBeNull()
  })
})

describe('what stops a crew being played', () => {
  it('says when the crew is over the encounter', () => {
    const a = arsenalFixture()
    const e = enc({ modelIds: ['m_swash', 'm_sent', 'm_siren'], encounterSize: 15 })
    expect(encounterProblems(e, a)).toEqual(['The crew costs 16ss, 1 over the 15ss encounter.'])
    expect(encounterReady(e, a)).toBe(false)
  })

  it('says when the agreed size is over the cap', () => {
    const a = arsenalFixture()
    const e = enc({ encounterSize: 30, opponent: { arsenalTotal: 35 } })
    expect(encounterProblems(e, a)[0]).toMatch(/at most 25ss/)
  })

  it('refuses equipment on a peon', () => {
    const a = arsenalFixture()
    const e = enc({ modelIds: ['m_peon'], encounterSize: 20, equipment: [{ rowId: 'eq_dup', holder: 'm_peon' }] })
    expect(encounterProblems(e, a)[0]).toMatch(/peon/)
  })

  it('names a hired model that has since left the arsenal', () => {
    const a = arsenalFixture()
    expect(encounterProblems(enc({ modelIds: ['m_dead'], encounterSize: 20 }), a)[0])
      .toMatch(/no longer in the arsenal/)
  })

  it('is ready once a size is known and nothing is wrong', () => {
    const a = arsenalFixture()
    expect(encounterReady(enc({ modelIds: ['m_swash'], opponent: { arsenalTotal: 20 } }), a)).toBe(true)
    expect(encounterReady(enc({ modelIds: ['m_swash'] }), a)).toBe(false)
  })
})

describe('editing', () => {
  it('releasing a model takes its kit and its tax with it', () => {
    const e = enc({
      modelIds: ['m_swash', 'm_sent'],
      taxed: ['m_swash'],
      equipment: [{ rowId: 'eq_dup', holder: 'm_swash' }, { rowId: 'eq_face', holder: 'm_sent' }],
    })
    const next = { ...e, ...toggleModel(e, 'm_swash') }
    expect(next.modelIds).toEqual(['m_sent'])
    expect(next.taxed).toEqual([])
    expect(next.equipment).toEqual([{ rowId: 'eq_face', holder: 'm_sent' }])
    expect({ ...next, ...toggleModel(next, 'm_swash') }.modelIds).toEqual(['m_sent', 'm_swash'])
  })

  it('leaving the totem behind takes its kit off', () => {
    const e = enc({ totem: true, equipment: [{ rowId: 'eq_face', holder: TOTEM }] })
    expect(toggleTotem(e)).toEqual({ totem: false, equipment: [] })
    expect(toggleTotem({ ...e, totem: false })).toEqual({ totem: true })
  })

  it('toggles the out-of-keyword surcharge per model', () => {
    const e = enc({ taxed: [] })
    expect(toggleTax(e, 'm_swash')).toEqual({ taxed: ['m_swash'] })
    expect(toggleTax({ taxed: ['m_swash'] }, 'm_swash')).toEqual({ taxed: [] })
  })

  it('moves one piece of kit between holders, never duplicating it', () => {
    const e = enc({ equipment: [{ rowId: 'eq_dup', holder: LEADER }] })
    expect(attachEquipment(e, 'eq_dup', 'm_swash')).toEqual({ equipment: [{ rowId: 'eq_dup', holder: 'm_swash' }] })
    expect(attachEquipment(e, 'eq_dup', null)).toEqual({ equipment: [] })
  })
})

describe('gameFieldsFrom', () => {
  it('hands the aftermath facts instead of questions', () => {
    const a = arsenalFixture()
    const e = enc({
      id: 'enc_1',
      modelIds: ['m_sent'],
      opponent: { name: 'Fish', arsenalTotal: 24, arsenalId: 'ars_fish', rating: '2' },
      strategy: 'Plant Explosives',
      equipment: [{ rowId: 'eq_dup', holder: 'm_sent' }, { rowId: 'eq_face', holder: LEADER }],
    })
    expect(gameFieldsFrom(e, a)).toEqual({
      encounterId: 'enc_1',
      opponent: 'Fish',
      opponentArsenalId: 'ars_fish',
      strategy: 'Plant Explosives',
      encounterSize: 25,
      campaignRatingSelf: 2, // 2 kit + 2 adv − 2 injuries
      campaignRatingOpponent: 2,
      equipmentHired: [
        { equipmentId: 'duplicator', rowId: 'eq_dup', modelId: 'm_sent', holder: 'm_sent' },
        { equipmentId: 'false-face', rowId: 'eq_face', modelId: null, holder: LEADER },
      ],
      hiredModelIds: ['m_sent'],
      totemHired: false,
    })
  })
})
