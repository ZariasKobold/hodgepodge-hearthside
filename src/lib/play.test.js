import { describe, it, expect } from 'vitest'
import {
  createPlay, unitOf, healthLeft, maxHealthOf, damage, setMaxHealth, toggleActivated,
  toggleKilled, addCondition, changeCondition, removeCondition, nextTurn, previousTurn,
  adjustPool, adjustVp, vpTotal, addSummon, removeSummon, activationCount, playFacts,
  LEADER, TOTEM,
} from './play.js'
import { createModel } from './shape/arsenal.js'

describe('createPlay', () => {
  it('starts on turn one with the pool it was given, floored at zero', () => {
    const p = createPlay({ pool: 7, encounterId: 'enc_1' })
    expect(p.turn).toBe(1)
    expect(p.pool).toBe(7)
    expect(p.encounterId).toBe('enc_1')
    expect(createPlay({ pool: -2 }).pool).toBe(0)
    expect(createPlay({ pool: null }).pool).toBe(0)
  })

  it('gives an untouched unit full health and nothing on it', () => {
    const p = createPlay()
    expect(unitOf(p, 'm1')).toEqual({ damage: 0, activated: false, killed: false, conditions: [], maxHealth: null })
    expect(healthLeft(p, 'm1', 6)).toBe(6)
    expect(healthLeft(p, 'm1')).toBeNull()
  })
})

describe('health', () => {
  it('takes damage and heals, never below zero or past the card', () => {
    let p = createPlay()
    p = damage(p, 'm1', 4, 6)
    expect(healthLeft(p, 'm1', 6)).toBe(2)
    p = damage(p, 'm1', 9, 6)
    expect(healthLeft(p, 'm1', 6)).toBe(0)
    expect(unitOf(p, 'm1').damage).toBe(6)
    p = damage(p, 'm1', -10, 6)
    expect(healthLeft(p, 'm1', 6)).toBe(6)
  })

  it('does not mark a model killed at zero; the player says so', () => {
    const p = damage(createPlay(), 'm1', 6, 6)
    expect(unitOf(p, 'm1').killed).toBe(false)
  })

  it('a typed maximum wins over the card, and clears back to it', () => {
    let p = setMaxHealth(createPlay(), 'smn_1', '5')
    expect(maxHealthOf(p, 'smn_1', 8)).toBe(5)
    p = damage(p, 'smn_1', 9, 8)
    expect(healthLeft(p, 'smn_1', 8)).toBe(0)
    p = setMaxHealth(p, 'smn_1', '')
    expect(maxHealthOf(p, 'smn_1', 8)).toBe(8)
    expect(setMaxHealth(createPlay(), 'x', 'abc').units.x.maxHealth).toBeNull()
  })

  it('touches only the unit it was asked about', () => {
    const p = damage(damage(createPlay(), 'm1', 2, 6), 'm2', 1, 6)
    expect(unitOf(p, 'm1').damage).toBe(2)
    expect(unitOf(p, 'm2').damage).toBe(1)
  })
})

describe('activations and turns', () => {
  it('a new turn readies everyone and counts on', () => {
    let p = toggleActivated(toggleActivated(createPlay(), LEADER), 'm1')
    expect(activationCount(p, [LEADER, 'm1', 'm2'])).toEqual({ done: 2, of: 3 })
    p = nextTurn(p)
    expect(p.turn).toBe(2)
    expect(activationCount(p, [LEADER, 'm1', 'm2'])).toEqual({ done: 0, of: 3 })
  })

  it('keeps damage and conditions across the turn', () => {
    let p = addCondition(damage(createPlay(), 'm1', 3, 6), 'm1', 'Burning', 2)
    p = nextTurn(p)
    expect(unitOf(p, 'm1').damage).toBe(3)
    expect(unitOf(p, 'm1').conditions).toEqual([{ name: 'Burning', value: 2 }])
  })

  it('goes back a turn but never before the first', () => {
    expect(previousTurn(nextTurn(createPlay())).turn).toBe(1)
    expect(previousTurn(createPlay()).turn).toBe(1)
  })

  it('a killed model leaves the activation count, and is no longer activated', () => {
    let p = toggleActivated(createPlay(), 'm1')
    p = toggleKilled(p, 'm1')
    expect(unitOf(p, 'm1').activated).toBe(false)
    expect(activationCount(p, [LEADER, 'm1'])).toEqual({ done: 0, of: 1 })
    expect(unitOf(toggleKilled(p, 'm1'), 'm1').killed).toBe(false)
  })
})

describe('conditions', () => {
  it('stacks a condition the unit already has, case-blind', () => {
    let p = addCondition(createPlay(), 'm1', 'Poison', 2)
    p = addCondition(p, 'm1', 'poison', 1)
    expect(unitOf(p, 'm1').conditions).toEqual([{ name: 'Poison', value: 3 }])
  })

  it('ignores a blank name', () => {
    const p = createPlay()
    expect(addCondition(p, 'm1', '  ')).toBe(p)
  })

  it('removes a condition counted down to nothing', () => {
    let p = addCondition(addCondition(createPlay(), 'm1', 'Burning', 1), 'm1', 'Focused', 1)
    p = changeCondition(p, 'm1', 'Burning', -1)
    expect(unitOf(p, 'm1').conditions).toEqual([{ name: 'Focused', value: 1 }])
    p = removeCondition(p, 'm1', 'Focused')
    expect(unitOf(p, 'm1').conditions).toEqual([])
  })
})

describe('pool and score', () => {
  it('spends and gains soulstones, never below zero', () => {
    const p = adjustPool(createPlay({ pool: 2 }), -1)
    expect(p.pool).toBe(1)
    expect(adjustPool(adjustPool(p, -1), -1).pool).toBe(0)
  })

  it('totals strategy and schemes, floors each at zero and refuses unknown fields', () => {
    let p = adjustVp(adjustVp(createPlay(), 'strategy', 2), 'schemes', 1)
    p = adjustVp(p, 'opponent', -1)
    expect(vpTotal(p)).toBe(3)
    expect(p.vp.opponent).toBe(0)
    expect(adjustVp(p, 'nonsense', 4)).toBe(p)
  })
})

describe('summons', () => {
  it('adds a model that is not in the arsenal, with its own id and health', () => {
    const p = addSummon(createPlay(), { name: ' Lost Love ', slug: 'lost-love', maxHealth: 4 })
    expect(p.summons).toHaveLength(1)
    const s = p.summons[0]
    expect(s).toMatchObject({ name: 'Lost Love', slug: 'lost-love' })
    expect(s.id).toMatch(/^smn_/)
    expect(maxHealthOf(p, s.id)).toBe(4)
    const gone = removeSummon(p, s.id)
    expect(gone.summons).toEqual([])
    expect(gone.units[s.id]).toBeUndefined()
  })

  it('refuses a summon with no name', () => {
    const p = createPlay()
    expect(addSummon(p, { name: '' })).toBe(p)
  })
})

describe('playFacts — what reaches the game log', () => {
  const hired = [
    createModel({ id: 'm1', name: 'Swashbuckler', cost: 4 }),
    createModel({ id: 'm2', name: 'Peon', cost: 3, peon: true }),
    createModel({ id: 'm3', name: 'Sentinel', cost: 5 }),
  ]

  it('carries the score, the schemes, the leader and the arsenal models killed', () => {
    let p = adjustVp(adjustVp(createPlay(), 'strategy', 3), 'schemes', 2)
    p = adjustVp(adjustVp(p, 'schemesScored', 2), 'opponent', 4)
    p = toggleKilled(toggleKilled(toggleKilled(p, 'm1'), 'm2'), LEADER)
    p = toggleKilled(addSummon(p, { name: 'Lost Love' }), TOTEM)
    p = toggleKilled(p, p.summons[0].id)
    expect(playFacts(p, { hiredModels: hired })).toEqual({
      vpSelf: 5,
      vpOpponent: 4,
      schemesCompleted: 2,
      killedModelIds: ['m1'], // not the peon, the summon or the totem
      leaderWasKilled: true,
      result: 'win',
    })
  })

  it('reads a level score as a draw and caps schemes at the hand ceiling', () => {
    const p = adjustVp(createPlay(), 'schemesScored', 5)
    expect(playFacts(p).result).toBe('draw')
    expect(playFacts(p).schemesCompleted).toBe(3)
    expect(playFacts(adjustVp(p, 'opponent', 1)).result).toBe('loss')
  })
})
