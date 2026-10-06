import { describe, it, expect } from 'vitest'
import { advancementKey, equipmentKey, injuryKey, textFor } from './book.js'
import { ADVANCEMENT_TABLES } from '../data/advancements.js'

describe('advancementKey', () => {
  /**
   * The three "Skill Boost" rows on the attack table are the whole reason this
   * key carries a value. Keying by name alone is the mistake v0.22.2 spent a
   * version undoing, and it would silently show the wrong text here.
   */
  it('separates rows that share a name', () => {
    const attack = ADVANCEMENT_TABLES.find((t) => t.id === 'attack')
    const boosts = attack.entries.filter((e) => e.name === 'Skill Boost')
    expect(boosts.length).toBeGreaterThan(1)
    const keys = new Set(boosts.map((e) => advancementKey('attack', e)))
    expect(keys.size).toBe(boosts.length)
  })

  it('separates rows that share a value', () => {
    const action = ADVANCEMENT_TABLES.find((t) => t.id === 'action')
    const nines = action.entries.filter((e) => e.value === 9)
    expect(nines.length).toBeGreaterThan(1)
    const keys = new Set(nines.map((e) => advancementKey('action', e)))
    expect(keys.size).toBe(nines.length)
  })

  /**
   * Across every table, no two rows may collide — a collision means one entry
   * silently displays another's text, which is worse than showing none.
   */
  it('is unique across all six tables', () => {
    const keys = []
    for (const table of ADVANCEMENT_TABLES) {
      for (const entry of table.entries || []) keys.push(advancementKey(table.id, entry))
    }
    expect(keys.every(Boolean)).toBe(true)
    expect(new Set(keys).size).toBe(keys.length)
  })

  /**
   * The scaffold is generated from `data/advancements.js`, where the number is
   * `value`; every lookup happens against an advancement *recorded on a leader*,
   * where the same number is `tableValue`. Reading only one of them found
   * nothing on a real record while looking perfectly correct against the data
   * file — caught in a browser, not by a test, so here is the test.
   */
  it('reads the recorded shape as well as the data-file shape', () => {
    const fromData = { value: 9, name: 'Balanced Sword' }
    const fromRecord = {
      id: 'adv_1', tableId: 'action', tableValue: 9, name: 'Balanced Sword',
      page: 47, flipValue: 10, cheated: true,
    }
    expect(advancementKey('action', fromRecord)).toBe(advancementKey('action', fromData))
  })

  it('is null when it cannot name a row', () => {
    expect(advancementKey(null, { name: 'x' })).toBeNull()
    expect(advancementKey('attack', {})).toBeNull()
  })
})

describe('equipmentKey and injuryKey', () => {
  it('use the id, which is already unique', () => {
    expect(equipmentKey('gatling-gun')).toBe('equipment:gatling-gun')
    expect(injuryKey('Pack Mule')).toBe('injury:Pack Mule')
  })
  it('are null without one', () => {
    expect(equipmentKey(null)).toBeNull()
    expect(injuryKey(undefined)).toBeNull()
  })
})

describe('textFor', () => {
  const book = new Map([['equipment:pistol', 'A pistol.'], ['equipment:sword', '   ']])

  it('returns the text when it is there', () => {
    expect(textFor(book, 'equipment:pistol')).toBe('A pistol.')
  })

  /**
   * The scaffold writes every key with an empty string, so "present but not yet
   * filled in" is the normal state of most of the file. It must read as absent.
   */
  it('treats an unfilled entry as absent', () => {
    expect(textFor(book, 'equipment:sword')).toBeNull()
    expect(textFor(new Map([['equipment:x', '']]), 'equipment:x')).toBeNull()
  })

  it('is null for a missing key, a missing book, or a missing id', () => {
    expect(textFor(book, 'equipment:nothing')).toBeNull()
    expect(textFor(null, 'equipment:pistol')).toBeNull()
    expect(textFor(book, null)).toBeNull()
  })

  /** Signed out, unearned, or nothing loaded — all the same empty map. */
  it('is null for every key when the book is empty', () => {
    expect(textFor(new Map(), 'equipment:pistol')).toBeNull()
  })

  /** The dev fallback hands back a plain object, so both shapes must read. */
  it('reads a plain object as well as a Map', () => {
    expect(textFor({ 'equipment:pistol': 'A pistol.' }, 'equipment:pistol')).toBe('A pistol.')
  })
})
