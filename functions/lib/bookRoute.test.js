import { describe, it, expect } from 'vitest'
import { onRequest } from '../api/book.js'

/**
 * `POST /api/book` on a database where the book tables do not exist yet.
 *
 * Production ran code whose tables were never applied, and every signed-in
 * page load got a 500 (audit v0.28.1 L6). The client already treated that as
 * "no text", so nothing broke, but the empty answer is the honest one.
 *
 * Lives in `lib/` beside the other Functions tests rather than in `api/`, where
 * every file is a route.
 */

const signedIn = (missing = /book_/) => ({
  DB: {
    prepare: (sql) => {
      const api = {
        bind: () => api,
        first: async () => (/FROM sessions/.test(sql)
          ? { id: 'u1', display_name: 'Z', avatar_url: null, provider: 'discord', expires_at: Date.now() + 1e6 }
          : null),
        all: async () => {
          if (missing.test(sql)) throw new Error(`D1_ERROR: no such table: ${sql.match(/book_\w+/)?.[0]}`)
          return { results: [] }
        },
        run: async () => ({ meta: { changes: 0 } }),
      }
      return api
    },
  },
})

const post = (body) => new Request('https://hodgepodgehearthside.com/api/book', {
  method: 'POST',
  headers: { Cookie: 'hh_session=s', Origin: 'https://hodgepodgehearthside.com' },
  body: JSON.stringify(body),
})

describe('the book route before its tables exist', () => {
  it.each([
    [{ action: 'status' }, { titles: [] }],
    [{ action: 'challenge', title: 'index-of-the-untold' }, { challenge: null }],
    [{ action: 'answer', challengeId: 'c', answer: '6' }, { ok: false }],
    [{ keys: ['equipment:coffee'] }, {}],
  ])('answers %j with the empty result, not a 500', async (body, expected) => {
    const res = await onRequest({ request: post(body), env: signedIn() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(expected)
  })

  it('still fails loudly on any other database error', async () => {
    const env = {
      DB: {
        prepare: (sql) => {
          const api = {
            bind: () => api,
            first: async () => ({ id: 'u1', expires_at: Date.now() + 1e6 }),
            all: async () => { throw new Error('D1_ERROR: database is locked') },
            run: async () => ({}),
          }
          return api
        },
      },
    }
    await expect(onRequest({ request: post({ action: 'status' }), env })).rejects.toThrow(/locked/)
  })
})
