import { describe, it, expect } from 'vitest'
import { getBookText, __test, NEW_KEYS_PER_DAY } from './bookStore.js'
// The only imports across the src/functions line (§6), and only in a test: they
// check that what `bookStore.js` duplicates still matches the client's copy.
// A test is never bundled, so the reason for the rule does not apply here.
import { EXPERIENCE_BOXES } from '../../src/data/advancements.js'
import { injuryKey } from '../../src/lib/book.js'

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
function fakeDB({
  arsenals = [], book = {}, granted = ['index-of-the-untold'], served = {},
} = {}) {
  const log = []
  /** key → first_at. The `book_served` table, as the daily allowance sees it. */
  const servedAt = { ...served }
  /** Lists are bound as JSON arrays and opened with json_each. */
  const flatBinds = (binds) => binds.flatMap((b) => (
    typeof b === 'string' && b.startsWith('[') ? JSON.parse(b) : [b]
  ))

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
            results: flatBinds(entry.binds)
              .filter((k) => k in book)
              .map((k) => ({ key: k, text: book[k] })),
          }
        }
        if (/SELECT COUNT\(\*\) AS n FROM book_served/.test(flat)) {
          const since = entry.binds[1]
          return { results: [{ n: Object.values(servedAt).filter((t) => t > since).length }] }
        }
        if (/SELECT key FROM book_served/.test(flat)) {
          const keys = JSON.parse(entry.binds[1])
          return { results: keys.filter((k) => k in servedAt).map((k) => ({ key: k })) }
        }
        return { results: [] }
      },
      run: async () => {
        if (/INSERT OR IGNORE INTO book_served/.test(flat)) {
          const [, at, list] = entry.binds
          for (const k of JSON.parse(list)) if (!(k in servedAt)) servedAt[k] = at
        }
        return { meta: { changes: 0 } }
      },
    }
    return api
  }

  return { log, servedAt, DB: { prepare: statement } }
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
    const db = fakeDB({ arsenals: [doc({ leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 1 } } })] })
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
      arsenals: [doc({ leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 1 } } })],
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
      arsenals: [doc({ leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 1 } } })],
      book: Object.fromEntries(everything.map((k) => [k, `text for ${k}`])),
    })

    const out = await getBookText('u1', everything, db)
    expect(Object.keys(out)).toEqual([KEY])

    // The SQL itself only ever named the entitled key. The binds are the keys
    // followed by the granted titles, so the unentitled ones must be absent
    // rather than the list being exactly one long.
    const read = db.log.find((e) => /FROM book_text/.test(e.sql))
    const named = JSON.parse(read.binds[0])
    expect(named).toContain(KEY)
    expect(named).not.toContain('advancement:attack:1:Dismember')
    expect(named).not.toContain('equipment:gatling-gun')
    expect(named).not.toContain('injury:broken-arm')
  })

  /**
   * The injury is built the way `Aftermath.jsx` writes one: a random row id, a
   * name and a page, and nothing else. The fixture this replaced carried an
   * `injuryId` no real record has, so it passed while no injury could ever be
   * entitled (audit v0.28.1 L5).
   */
  it('answers for equipment and injuries the arsenal holds', async () => {
    const mule = injuryKey('Pack Mule')
    const db = fakeDB({
      arsenals: [doc({
        equipment: [{ id: 'eqp_1', equipmentId: 'gatling-gun' }],
        injuries: [{ id: 'inj_mx81k2', name: 'Pack Mule', page: 34, modelId: 'mdl_1' }],
      })],
      book: { 'equipment:gatling-gun': 'gun', [mule]: 'mule' },
    })
    const out = await getBookText('u1', ['equipment:gatling-gun', mule], db)
    expect(out).toEqual({ 'equipment:gatling-gun': 'gun', [mule]: 'mule' })
  })

  it('finds advancements on the totem and the crew card too', async () => {
    const totemAdv = { id: 'a', tableId: 'attack', tableValue: 3, name: 'Arcane Jolt' }
    const ccAdv = { id: 'b', tableId: 'crew-card', tableValue: 2, name: 'Heavy Blow' }
    const db = fakeDB({
      arsenals: [doc({
        leader: { advancements: [], experience: { boxesChecked: 2 } },
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
      arsenals: [{ doc: '{not json' }, doc({ leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 1 } } })],
      book: { [KEY]: 'still here' },
    })
    expect(await getBookText('u1', [KEY], db)).toEqual({ [KEY]: 'still here' })
  })

  it('is empty for an empty or malformed ask', async () => {
    const db = fakeDB({ arsenals: [doc({ leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 1 } } })] })
    expect(await getBookText('u1', [], db)).toEqual({})
    expect(await getBookText('u1', null, db)).toEqual({})
    expect(await getBookText('u1', 'give me everything', db)).toEqual({})
    expect(db.log).toHaveLength(0)
  })

  it('does not distinguish "not yours" from "does not exist"', async () => {
    const db = fakeDB({
      arsenals: [doc({ leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 1 } } })],
      book: { [KEY]: 'text' },
    })
    const out = await getBookText('u1', ['advancement:attack:1:Dismember', 'nonsense:key'], db)
    expect(out).toEqual({})
  })
})

/* ── friction that does not trust the document (audit v0.28.1 H2) ── */

describe('an implausible arsenal entitles nothing', () => {
  it('pays for exactly the 15 numbered boxes on the track', () => {
    const numbered = EXPERIENCE_BOXES
      .map((v, i) => (v == null ? null : i))
      .filter((i) => i != null)
    expect(__test.ADVANCEMENT_BOX_INDEXES).toEqual(numbered)
    expect(__test.advancementsPaidFor(0)).toBe(0)
    expect(__test.advancementsPaidFor(3)).toBe(3)
    expect(__test.advancementsPaidFor(4)).toBe(3)
    expect(__test.advancementsPaidFor(39)).toBe(15)
  })

  it('refuses an arsenal claiming more advancements than its boxes paid for', async () => {
    const forged = doc({
      leader: { advancements: [BALANCED_SWORD, { ...BALANCED_SWORD, id: 'adv_2' }], experience: { boxesChecked: 1 } },
      equipment: [{ id: 'e1', equipmentId: 'gatling-gun' }],
    })
    const db = fakeDB({
      arsenals: [forged],
      book: { [KEY]: 'sword', 'equipment:gatling-gun': 'gun' },
    })
    // Its equipment is not trusted either.
    expect(await getBookText('u1', [KEY, 'equipment:gatling-gun'], db)).toEqual({})
  })

  it('counts the totem and the crew card against the same track', () => {
    const over = {
      leader: { advancements: [BALANCED_SWORD], experience: { boxesChecked: 2 } },
      totem: { advancements: [BALANCED_SWORD] },
      crewCardAdvancements: [BALANCED_SWORD],
    }
    expect(__test.plausibleArsenal(over)).toBe(false)
    expect(__test.plausibleArsenal({ ...over, leader: { ...over.leader, experience: { boxesChecked: 3 } } })).toBe(true)
  })

  it('still trusts a plausible arsenal next to a forged one', async () => {
    const db = fakeDB({
      arsenals: [
        doc({ leader: { advancements: [BALANCED_SWORD, BALANCED_SWORD], experience: { boxesChecked: 0 } } }),
        doc({ equipment: [{ id: 'e1', equipmentId: 'coffee' }] }),
      ],
      book: { 'equipment:coffee': 'coffee' },
    })
    expect(await getBookText('u1', ['equipment:coffee'], db)).toEqual({ 'equipment:coffee': 'coffee' })
  })
})

describe('the daily allowance of new text', () => {
  const kit = (n) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, equipmentId: `item-${i}` }))
  const keys = (n) => Array.from({ length: n }, (_, i) => `equipment:item-${i}`)

  it('serves at most NEW_KEYS_PER_DAY keys never seen before', async () => {
    const db = fakeDB({
      arsenals: [doc({ equipment: kit(100) })],
      book: Object.fromEntries(keys(100).map((k) => [k, 'text'])),
    })
    const out = await getBookText('u1', keys(100), db)
    expect(Object.keys(out)).toHaveLength(NEW_KEYS_PER_DAY)
    expect(Object.keys(db.servedAt)).toHaveLength(NEW_KEYS_PER_DAY)
  })

  it('serves a key seen before freely, even with the allowance spent', async () => {
    const now = Date.now()
    const served = Object.fromEntries(keys(NEW_KEYS_PER_DAY).map((k) => [k, now - 1000]))
    const db = fakeDB({
      arsenals: [doc({ equipment: kit(NEW_KEYS_PER_DAY + 1) })],
      book: Object.fromEntries(keys(NEW_KEYS_PER_DAY + 1).map((k) => [k, 'text'])),
      served,
    })
    const out = await getBookText('u1', keys(NEW_KEYS_PER_DAY + 1), db)
    // Every old one, and not the new one.
    expect(Object.keys(out)).toHaveLength(NEW_KEYS_PER_DAY)
    expect(out).not.toHaveProperty(`equipment:item-${NEW_KEYS_PER_DAY}`)
  })

  it('opens again once yesterday has passed', async () => {
    const old = Date.now() - 2 * 24 * 60 * 60 * 1000
    const served = Object.fromEntries(keys(NEW_KEYS_PER_DAY).map((k) => [k, old]))
    const db = fakeDB({
      arsenals: [doc({ equipment: kit(NEW_KEYS_PER_DAY + 1) })],
      book: Object.fromEntries(keys(NEW_KEYS_PER_DAY + 1).map((k) => [k, 'text'])),
      served,
    })
    const out = await getBookText('u1', keys(NEW_KEYS_PER_DAY + 1), db)
    expect(Object.keys(out)).toHaveLength(NEW_KEYS_PER_DAY + 1)
  })

  it('records only keys that exist, so a typo spends nothing', async () => {
    const db = fakeDB({
      arsenals: [doc({ equipment: [{ id: 'e', equipmentId: 'coffee' }, { id: 'f', equipmentId: 'no-such' }] })],
      book: { 'equipment:coffee': 'coffee' },
    })
    await getBookText('u1', ['equipment:coffee', 'equipment:no-such'], db)
    expect(Object.keys(db.servedAt)).toEqual(['equipment:coffee'])
  })

  it('binds the caller on every allowance statement', async () => {
    const db = fakeDB({
      arsenals: [doc({ equipment: [{ id: 'e', equipmentId: 'coffee' }] })],
      book: { 'equipment:coffee': 'coffee' },
    })
    await getBookText('u1', ['equipment:coffee'], db)
    const allowance = db.log.filter((e) => /book_served/.test(e.sql))
    expect(allowance.length).toBeGreaterThan(0)
    for (const e of allowance) expect(e.binds[0]).toBe('u1')
  })

  it('never binds more than 100 parameters, which D1 refuses', async () => {
    const db = fakeDB({
      arsenals: [doc({ equipment: kit(300) })],
      book: Object.fromEntries(keys(300).map((k) => [k, 'text'])),
    })
    await getBookText('u1', keys(300), db)
    for (const e of db.log) expect(e.binds.length).toBeLessThanOrEqual(100)
  })
})
