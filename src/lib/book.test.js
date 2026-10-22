import { describe, it, expect, vi } from 'vitest'
import { advancementKey, equipmentKey, injuryKey, entryFor, fromBook, fromRegister, ensureBookText, resetBookCache } from './book.js'
import { BOOK_SOURCES } from '../data/bookSources.js'
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

describe('fromBook', () => {
  it('reads an action into the shape the record renders', () => {
    const e = fromBook(JSON.stringify({
      kind: 'action', name: 'Ice Blast', isSignature: false, stoneCost: 0,
      rangeTypeLabel: 'Magic', range: '14', stat: '5', resistedBy: 'Df',
      targetNumber: null, damage: '2', description: 'If this action receives a raise...',
    }))
    expect(e).toMatchObject({
      kind: 'action', source: 'book', name: 'Ice Blast', range: '14', rangeTypeLabel: 'Magic',
      stat: '5', resistedBy: 'Df', damage: '2', isSignature: false, triggers: [],
    })
  })

  it('spells a trigger suit the way the register does', () => {
    const e = fromBook(JSON.stringify({ kind: 'trigger', name: 'Dismember', suits: '{{crow}}', description: 'x' }))
    expect(e).toMatchObject({ kind: 'trigger', suits: 'Crow', description: 'x' })
    expect(fromBook(JSON.stringify({ kind: 'trigger', name: 'Heavy Fall', suits: '{{stone}}', description: 'x' })).suits)
      .toBe('Soulstone')
  })

  it("names an ability's defence symbol", () => {
    const e = fromBook(JSON.stringify({ kind: 'ability', name: 'Evasive', suits: '{{fortitude}}', description: 'x' }))
    expect(e).toMatchObject({ kind: 'ability', defence: 'Fortitude' })
  })

  it("leaves a totem's register-carried parts pending, keeping their signature", () => {
    const e = fromBook(JSON.stringify({
      kind: 'totem', name: 'Gravehand', abilities: [],
      actions: [
        { kind: 'action', name: "Grave's Curse", stat: '5', description: 'own text' },
        { name: 'Command Corpse', isSignature: true, fromRegister: true },
      ],
    }))
    expect(e.actions[0]).toMatchObject({ source: 'book', description: 'own text' })
    expect(e.actions[1]).toEqual({ kind: 'action', name: 'Command Corpse', isSignature: true, source: 'pending' })
  })

  it('reads hand-typed prose as text, and nothing as null', () => {
    expect(fromBook('A pistol.')).toEqual({ kind: 'text', source: 'book', description: 'A pistol.' })
    expect(fromBook('')).toBeNull()
    expect(fromBook('   ')).toBeNull()
    expect(fromBook(undefined)).toBeNull()
  })
})

describe('fromRegister', () => {
  /** The register's flag is wrong for printed signature actions (lib/signature.js). */
  it("takes signature from the book's row, not the register", () => {
    const rec = { name: 'Tap the Leyline', slug: '9-tap-the-leyline', is_signature: false, stone_cost: 1, description: 'x' }
    expect(fromRegister('actions', rec, { isSignature: true }).isSignature).toBe(true)
    expect(fromRegister('actions', { ...rec, is_signature: true }, { isSignature: false }).isSignature).toBe(false)
  })

  /** A leader taking an action does not take its source card's triggers (§4). */
  it("drops the source card's triggers", () => {
    const rec = { name: 'Hand Cannon', triggers: [{ name: 'Onslaught', suits: 'Ram', description: 'x' }] }
    expect(fromRegister('actions', rec, null).triggers).toEqual([])
  })

  it('names an ability defence from the register type', () => {
    const rec = { name: 'Hard to Kill', defensive_ability_type: 'physical_defense', description: 'x' }
    expect(fromRegister('abilities', rec).defence).toBe('Fortitude')
  })
})

describe('entryFor', () => {
  const book = new Map([['k', { kind: 'text', description: 'x' }], ['s', 'a string']])
  it('returns an entry, and nothing for a string, a missing key or a missing book', () => {
    expect(entryFor(book, 'k')).toEqual({ kind: 'text', description: 'x' })
    expect(entryFor(book, 's')).toBeNull()
    expect(entryFor(book, 'missing')).toBeNull()
    expect(entryFor(null, 'k')).toBeNull()
    expect(entryFor(book, null)).toBeNull()
  })
})

describe('BOOK_SOURCES', () => {
  /** A source key that names no row would never be asked for, and hide a typo. */
  it('names only rows that exist', () => {
    const keys = new Set()
    for (const table of ADVANCEMENT_TABLES) {
      for (const entry of table.entries || []) keys.add(advancementKey(table.id, entry))
    }
    for (const key of Object.keys(BOOK_SOURCES)) {
      expect(keys.has(key.split('|')[0]), key).toBe(true)
    }
  })

  it('holds identifiers only, never text', () => {
    for (const where of Object.values(BOOK_SOURCES)) {
      expect(Object.keys(where).sort()).toEqual(['from', 'slug'])
      expect(['actions', 'abilities', 'triggers']).toContain(where.from)
    }
  })
})

describe('ensureBookText', () => {
  const key = 'advancement:action:1:Hand Cannon'
  const text = JSON.stringify({ kind: 'action', name: 'Hand Cannon', stat: '6', description: '' })

  /**
   * React's development double-mount runs an effect, discards it, and runs it
   * again. The second call found every key already asked for and resolved to
   * the still-empty cache, and the first call's answer was thrown away — so no
   * text ever appeared. Found in a browser, v0.37.0.
   */
  it('makes a second caller wait for keys already in flight', async () => {
    resetBookCache()
    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ [key]: text }) }))
    try {
      const first = ensureBookText([key])
      const second = await ensureBookText([key])
      expect(entryFor(second, key)).toMatchObject({ kind: 'action', name: 'Hand Cannon' })
      await first
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = realFetch
      resetBookCache()
    }
  })

  it('never asks the server for a key BiggerHat carries', async () => {
    resetBookCache()
    const realFetch = globalThis.fetch
    const bhKey = Object.keys(BOOK_SOURCES).find((k) => !k.includes('|'))
    globalThis.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    try {
      await ensureBookText([bhKey])
      const bodies = globalThis.fetch.mock.calls
        .filter(([url]) => url === '/api/book')
        .map(([, init]) => JSON.parse(init.body).keys)
      expect(bodies.flat()).not.toContain(bhKey)
    } finally {
      globalThis.fetch = realFetch
      resetBookCache()
    }
  })
})
