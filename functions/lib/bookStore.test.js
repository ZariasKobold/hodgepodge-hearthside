import { describe, it, expect } from 'vitest'
import { getBookText, __test } from './bookStore.js'

/**
 * Authorization tests for the one table with no `owner_user_id`.
 *
 * `book_text` is shared reference data, so the usual structural guard — every
 * statement filters on the caller — cannot apply to it, and the entitlement
 * check in `bookStore.js` stands in its place. That makes these tests the only
 * thing between "signed in" and "has read the whole campaign book", which is
 * the situation `campaignStore.test.js`'s header describes for campaigns.
 *
 * The fake dispatches on the SQL, because this store runs two different
 * statements and the interesting assertions are about what the *second* one was
 * allowed to ask for.
 */
/**
 * `granted` defaults to every title, because these tests are about
 * **entitlement** — which rows your leader has earned — and the separate
 * question of whether you have proved you own the book is covered in
 * `bookAccess.test.js`. A fixture that failed both gates at once would stop
 * telling you which one it was testing.
 */
function fakeDB({ arsenals = [], book = {}, granted = ['index-of-the-untold'] } = {}) {
  const log = []

  const statement = (sql) => {
    const flat = sql.replace(/\s+/g, ' ').trim()
    const entry = { sql: flat, binds: [] }
    const api = {
      bind: (...binds) => {
        entry.binds = binds
        log.push(entry)
        return api
      },
      first: async () => null,
      all: async () => {
        if (/FROM arsenals/.test(flat)) return { results: arsenals }
        if (/FROM book_access/.test(flat)) {
          return { results: granted.map((t) => ({ title: t })) }
        }
        if (/FROM book_text/.test(flat)) {
          // The binds are the keys followed by the titles, so filter to the
          // ones that name a book row rather than assuming the whole list.
          return {
            results: entry.binds
              .filter((k) => k in book)
              .map((k) => ({ key: k, text: book[k] })),
          }
        }
        return { results: [] }
      },
      run: async () => ({ meta: { changes: 0 } }),
    }
    return api
  }

  return { log, DB: { prepare: statement } }
}

/** An arsenal document row, as `doc` comes back from D1. */
const doc = (over = {}) => ({
  doc: JSON.stringify({
    id: 'ars_1',
    leader: { advancements: [], experience: { boxesChecked: 0 } },
    equipment: [],
    injuries: [],
    crewCardAdvancements: [],
    totem: null,
    ...over,
  }),
})

const BALANCED_SWORD = {
  id: 'adv_1', tableId: 'action', tableValue: 9, name: 'Balanced Sword',
}
const KEY = 'advancement:action:9:Balanced Sword'

describe('the subject guard', () => {
  it('refuses to run without a user', async () => {
    const db = fakeDB()
    await expect(getBookText(null, [KEY], db)).rejects.toThrow(/without a user/)
    await expect(getBookText('', [KEY], db)).rejects.toThrow(/without a user/)
    expect(db.log).toHaveLength(0)
  })
})

describe('every read is scoped to the caller', () => {
  it('binds the caller when reading their arsenals', async () => {
    const db = fakeDB({ arsenals: [doc({ leader: { advancements: [BALANCED_SWORD] } })] })
    await getBookText('u1', [KEY], db)

    const read = db.log.find((e) => /FROM arsenals/.test(e.sql))
    expect(read.sql).toMatch(/WHERE user_id = \?/)
    expect(read.binds).toEqual(['u1'])
  })

  /** The whole point. Another account's leader entitles nothing. */
  it('returns nothing when the caller holds nothing', async () => {
    const db = fakeDB({ arsenals: [], book: { [KEY]: 'the text' } })
    expect(await getBookText('u1', [KEY], db)).toEqual({})
    // And it never even asked the book table.
    expect(db.log.some((e) => /FROM book_text/.test(e.sql))).toBe(false)
  })
})

describe('entitlement is what you hold, not what you ask for', () => {
  it('answers for an advancement the leader holds', async () => {
    const db = fakeDB({
      arsenals: [doc({ leader: { advancements: [BALANCED_SWORD] } })],
      book: { [KEY]: 'Balanced Sword text.' },
    })
    expect(await getBookText('u1', [KEY], db)).toEqual({ [KEY]: 'Balanced Sword text.' })
  })

  /**
   * The scrape this design exists to prevent: one signed-in request asking for
   * the whole book. Only the earned row comes back.
   */
  it('returns only the held keys when asked for everything', async () => {
    const everything = [
      KEY,
      'advancement:attack:1:Dismember',
      'equipment:gatling-gun',
      'injury:broken-arm',
    ]
    const db = fakeDB({
      arsenals: [doc({ leader: { advancements: [BALANCED_SWORD] } })],
      book: Object.fromEntries(everything.map((k) => [k, `text for ${k}`])),
    })

    const out = await getBookText('u1', everything, db)
    expect(Object.keys(out)).toEqual([KEY])

    // The SQL itself only ever named the entitled key. The binds are the keys
    // followed by the granted titles, so the unentitled ones must be absent
    // rather than the list being exactly one long.
    const read = db.log.find((e) => /FROM book_text/.test(e.sql))
    expect(read.binds).toContain(KEY)
    expect(read.binds).not.toContain('advancement:attack:1:Dismember')
    expect(read.binds).not.toContain('equipment:gatling-gun')
    expect(read.binds).not.toContain('injury:broken-arm')
  })

  it('answers for equipment and injuries the arsenal holds', async () => {
    const db = fakeDB({
      arsenals: [doc({
        equipment: [{ id: 'eqp_1', equipmentId: 'gatling-gun' }],
        injuries: [{ id: 'inj_1', injuryId: 'broken-arm' }],
      })],
      book: { 'equipment:gatling-gun': 'gun', 'injury:broken-arm': 'arm' },
    })
    const out = await getBookText('u1', ['equipment:gatling-gun', 'injury:broken-arm'], db)
    expect(out).toEqual({ 'equipment:gatling-gun': 'gun', 'injury:broken-arm': 'arm' })
  })

  it('finds advancements on the totem and the crew card too', async () => {
    const totemAdv = { id: 'a', tableId: 'attack', tableValue: 3, name: 'Arcane Jolt' }
    const ccAdv = { id: 'b', tableId: 'crew-card', tableValue: 2, name: 'Heavy Blow' }
    const db = fakeDB({
      arsenals: [doc({
        totem: { advancements: [totemAdv] },
        crewCardAdvancements: [ccAdv],
      })],
      book: {
        'advancement:attack:3:Arcane Jolt': 'jolt',
        'advancement:crew-card:2:Heavy Blow': 'blow',
      },
    })
    const out = await getBookText('u1', [
      'advancement:attack:3:Arcane Jolt',
      'advancement:crew-card:2:Heavy Blow',
    ], db)
    expect(Object.keys(out).sort()).toEqual([
      'advancement:attack:3:Arcane Jolt',
      'advancement:crew-card:2:Heavy Blow',
    ])
  })

  /**
   * `value` on a data-file row, `tableValue` on a recorded one. Reading only
   * one was a real bug on the client; here it would silently entitle nothing.
   */
  it('reads both spellings of the row number', () => {
    const fromRecord = __test.advancementKey({ tableId: 'action', tableValue: 9, name: 'X' })
    const fromData = __test.advancementKey({ tableId: 'action', value: 9, name: 'X' })
    expect(fromRecord).toBe(fromData)
  })
})

describe('it cannot be made to misbehave', () => {
  it('caps how many keys one request may ask about', async () => {
    const many = Array.from({ length: 500 }, (_, i) => `equipment:item-${i}`)
    const held = many.slice(0, 300).map((k, i) => ({ id: `e${i}`, equipmentId: `item-${i}` }))
    const db = fakeDB({
      arsenals: [doc({ equipment: held })],
      book: Object.fromEntries(many.map((k) => [k, 'text'])),
    })

    const out = await getBookText('u1', many, db)
    expect(Object.keys(out).length).toBeLessThanOrEqual(__test.MAX_KEYS)
  })

  /** One unreadable document must not take the text away from every other. */
  it('ignores a corrupt document instead of throwing', async () => {
    const db = fakeDB({
      arsenals: [{ doc: '{not json' }, doc({ leader: { advancements: [BALANCED_SWORD] } })],
      book: { [KEY]: 'still here' },
    })
    expect(await getBookText('u1', [KEY], db)).toEqual({ [KEY]: 'still here' })
  })

  it('is empty for an empty or malformed ask', async () => {
    const db = fakeDB({ arsenals: [doc({ leader: { advancements: [BALANCED_SWORD] } })] })
    expect(await getBookText('u1', [], db)).toEqual({})
    expect(await getBookText('u1', null, db)).toEqual({})
    expect(await getBookText('u1', 'give me everything', db)).toEqual({})
    expect(db.log).toHaveLength(0)
  })

  it('does not distinguish "not yours" from "does not exist"', async () => {
    const db = fakeDB({
      arsenals: [doc({ leader: { advancements: [BALANCED_SWORD] } })],
      book: { [KEY]: 'text' },
    })
    const out = await getBookText('u1', ['advancement:attack:1:Dismember', 'nonsense:key'], db)
    expect(out).toEqual({})
  })
})
