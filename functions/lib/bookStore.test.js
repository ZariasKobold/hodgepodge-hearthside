import { describe, it, expect } from 'vitest'
import { getBookText, MAX_KEYS } from './bookStore.js'

/**
 * `book_text` is open to any signed-in player since v0.37.0 (owner decision —
 * see `bookStore.js`). What is left to hold: a user is required, the ask is
 * capped, and the statement never binds more than D1 accepts.
 */
function fakeDB(book = {}) {
  const log = []
  const statement = (sql) => {
    const entry = { sql: sql.replace(/\s+/g, ' ').trim(), binds: [] }
    const api = {
      bind: (...binds) => { entry.binds = binds; log.push(entry); return api },
      all: async () => ({
        results: JSON.parse(entry.binds[0])
          .filter((k) => k in book)
          .map((k) => ({ key: k, text: book[k] })),
      }),
    }
    return api
  }
  return { DB: { prepare: statement }, log }
}

describe('reading the book', () => {
  it('refuses to run without a user', async () => {
    await expect(getBookText('', ['x'], fakeDB())).rejects.toThrow(/without a user/)
    await expect(getBookText(undefined, ['x'], fakeDB())).rejects.toThrow(/without a user/)
  })

  it('answers any key that has a row, and omits the rest', async () => {
    const env = fakeDB({ a: 'text a', b: 'text b' })
    expect(await getBookText('u1', ['a', 'missing'], env)).toEqual({ a: 'text a' })
  })

  it('is empty for an empty or malformed ask, without touching the database', async () => {
    const env = fakeDB({ a: 'x' })
    expect(await getBookText('u1', [], env)).toEqual({})
    expect(await getBookText('u1', 'a', env)).toEqual({})
    expect(await getBookText('u1', [null, 3, ''], env)).toEqual({})
    expect(env.log).toHaveLength(0)
  })

  it('caps the ask and binds it as one parameter, which D1 accepts', async () => {
    const env = fakeDB()
    const keys = Array.from({ length: MAX_KEYS + 50 }, (_, i) => `k${i}`)
    await getBookText('u1', keys, env)
    expect(env.log).toHaveLength(1)
    expect(env.log[0].binds).toHaveLength(1)
    expect(JSON.parse(env.log[0].binds[0])).toHaveLength(MAX_KEYS)
  })
})
