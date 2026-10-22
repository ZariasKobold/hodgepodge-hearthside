import { describe, it, expect } from 'vitest'
import {
  pickSignature, leaderSignature, gainedSignature, unansweredSignatures, withPickSignature,
} from './signature.js'
import { findTable, ALWAYS } from '../data/advancements.js'

const BLOWDART = 'skulker-skin::attack::Blowdart'
const RAFT = 'aunty-mel::tactical::Life Raft'

/** Cletus and Duke Carcinus as built before v0.36.0: nobody was ever asked. */
const leader = (over = {}) => ({
  name: 'Cletus and Duke Carcinus',
  picks: {
    attack: [{ key: BLOWDART, name: 'Blowdart', model: 'Skulker Skin', cost: 5 }],
    tactical: [
      { key: 'aunty-mel::tactical::Inclement Weather', name: 'Inclement Weather', model: 'Aunty Mel', cost: 8 },
      { key: RAFT, name: 'Life Raft', model: 'Aunty Mel', cost: 8 },
    ],
    ability: [{ key: 'x::ability::Deadly Pursuit', name: 'Deadly Pursuit', model: 'X', cost: 5 }],
  },
  advancements: [],
  ...over,
})

const signatureAdv = (key, name) => ({
  id: 'adv_sig', tableId: 'tactical', name: 'Tactical Signature', tableValue: 13,
  appliesTo: { key, name, slot: 'tactical' },
})

const gained = (name, value) => ({ id: `adv_${name}`, tableId: 'action', name, tableValue: value })

describe('pickSignature', () => {
  it('is null until answered, and never reads the register flag', () => {
    expect(pickSignature({ name: 'Life Raft' })).toBeNull()
    // `isSignature` is what the register's (unreliable) flag is called once
    // read. A pick that somehow carried it must not count as an answer.
    expect(pickSignature({ name: 'Life Raft', isSignature: false })).toBeNull()
    expect(pickSignature({ signature: true })).toBe(true)
    expect(pickSignature({ signature: false })).toBe(false)
  })
})

describe('leaderSignature', () => {
  it('takes the player’s answer for a chosen action', () => {
    const l = leader()
    l.picks.tactical[1].signature = true
    expect(leaderSignature(l, l.picks.tactical[1])).toEqual({ signature: true, source: 'player' })
    l.picks.tactical[1].signature = false
    expect(leaderSignature(l, l.picks.tactical[1])).toEqual({ signature: false, source: 'player' })
  })

  it('is unknown, not false, when nobody has answered', () => {
    const l = leader()
    expect(leaderSignature(l, l.picks.attack[0])).toEqual({ signature: null, source: null })
  })

  it('a Signature advancement wins over a "no"', () => {
    const l = leader({ advancements: [signatureAdv(RAFT, 'Life Raft')] })
    l.picks.tactical[1].signature = false
    expect(leaderSignature(l, l.picks.tactical[1])).toEqual({ signature: true, source: 'advancement' })
  })

  it('a trigger or Skl advancement does not make an action signature', () => {
    const l = leader({
      advancements: [
        { id: 'a', tableId: 'attack', name: 'Draw Out Secrets', tableValue: 9, appliesTo: { key: BLOWDART } },
        { id: 'b', tableId: 'attack', name: 'Skill Boost', tableValue: 7, appliesTo: { key: BLOWDART } },
      ],
    })
    expect(leaderSignature(l, l.picks.attack[0]).signature).toBeNull()
  })
})

describe('gainedSignature', () => {
  it('reads the book for a gained tier-2 action', () => {
    const l = leader()
    expect(gainedSignature(l, gained('A Cage for All', 10))).toEqual({ signature: true, source: 'book' })
    expect(gainedSignature(l, gained('Balanced Sword', 9))).toEqual({ signature: false, source: 'book' })
    expect(gainedSignature(l, gained('Tap the Leyline', ALWAYS))).toEqual({ signature: true, source: 'book' })
  })

  it('is unknown for a row it cannot resolve', () => {
    expect(gainedSignature(leader(), gained('Nothing of the Sort', 4)).signature).toBeNull()
  })

  it('a Signature advancement on a gained action makes it one', () => {
    const adv = gained('Balanced Sword', 9)
    const l = leader({
      advancements: [adv, {
        id: 'adv_s', tableId: 'attack', name: 'Attack Signature', tableValue: 13,
        appliesTo: { key: `adv::${adv.id}`, name: 'Balanced Sword', gained: true },
      }],
    })
    expect(gainedSignature(l, adv)).toEqual({ signature: true, source: 'advancement' })
  })
})

describe('the book data', () => {
  // Read by font from pp. 44–49 on 2026-10-22: all 73 rows matched on their
  // recorded page. A row gaining or losing the flag should be a decision.
  it('marks 26 of the 73 tier-2 actions signature', () => {
    const rows = findTable('action').entries.filter((r) => r.kind)
    expect(rows).toHaveLength(73)
    expect(rows.filter((r) => r.isSignature)).toHaveLength(26)
  })

  it('keeps `signature` for the modifier rows only', () => {
    const rows = findTable('action').entries
    expect(rows.some((r) => 'signature' in r)).toBe(false)
  })
})

describe('unansweredSignatures', () => {
  it('lists every chosen action nobody has answered for, and never an ability', () => {
    const names = unansweredSignatures(leader()).map((u) => u.pick.name)
    expect(names).toEqual(['Blowdart', 'Inclement Weather', 'Life Raft'])
  })

  it('leaves out an answered one, and one an advancement already settles', () => {
    const l = leader({ advancements: [signatureAdv(RAFT, 'Life Raft')] })
    l.picks.attack[0].signature = false
    expect(unansweredSignatures(l).map((u) => u.pick.name)).toEqual(['Inclement Weather'])
  })

  it('is empty for a leader with no picks', () => {
    expect(unansweredSignatures({ picks: {} })).toEqual([])
    expect(unansweredSignatures(null)).toEqual([])
  })
})

describe('the answer survives the load-time lift', () => {
  // `migrateArsenal` runs on every load (shelf.js). A pick field it dropped
  // would be an answer the player gave once and lost on the next reload.
  it('keeps both a yes and a no', async () => {
    const { migrateArsenal } = await import('./shape/migrate.js')
    const { createArsenal, createLeader } = await import('./shape/arsenal.js')
    const l = leader()
    l.picks.attack[0].signature = false
    l.picks.tactical[1].signature = true
    const lifted = migrateArsenal(JSON.parse(JSON.stringify(createArsenal({ leader: createLeader(l) }))))
    expect(lifted.leader.picks.attack[0].signature).toBe(false)
    expect(lifted.leader.picks.tactical[1].signature).toBe(true)
    expect('signature' in lifted.leader.picks.tactical[0]).toBe(false)
  })
})

describe('withPickSignature', () => {
  it('sets one pick and leaves the rest alone', () => {
    const before = leader().picks.tactical
    const after = withPickSignature(before, RAFT, true)
    expect(after[1].signature).toBe(true)
    expect(after[0]).toBe(before[0])
    expect(before[1].signature).toBeUndefined()
  })

  it('null takes the answer off entirely', () => {
    const set = withPickSignature(leader().picks.tactical, RAFT, false)
    expect(set[1].signature).toBe(false)
    expect('signature' in withPickSignature(set, RAFT, null)[1]).toBe(false)
  })
})
