import { describe, it, expect } from 'vitest'
import { webcrypto } from 'node:crypto'
import {
  getChallenge, answerChallenge, normaliseAnswer, hashAnswer,
  getBookText, MAX_FAILURES, LOCKOUT_MS,
} from './bookStore.js'

// The store is written for the edge, where `crypto.subtle` is a global.
if (!globalThis.crypto) globalThis.crypto = webcrypto

/**
 * Proving you own the book.
 *
 * There is no purchase API to check against — Wyrd has none — so ownership can
 * only be *demonstrated*, never verified, and everything here is what stands
 * between a demonstration and a guess. The answers are low-entropy by nature (a
 * stat line is a small number), which makes the attempt limiter as much a part
 * of the gate as the hash is. These tests are in the same category as
 * `campaignStore.test.js`: the code they cover is the only thing underneath.
 */
function accessDB({ granted = [], challenges = [], attempts = null, arsenals = [], book = {} } = {}) {
  const log = []
  const state = { granted: [...granted], attempts, writes: [] }

  const statement = (sql) => {
    const flat = sql.replace(/\s+/g, ' ').trim()
    const entry = { sql: flat, binds: [] }
    const api = {
      bind: (...binds) => { entry.binds = binds; log.push(entry); return api },
      first: async () => null,
      all: async () => {
        if (/FROM book_access/.test(flat)) {
          return { results: state.granted.map((t) => ({ title: t })) }
        }
        if (/FROM book_challenges/.test(flat)) {
          if (/WHERE id = \?/.test(flat)) {
            const found = challenges.find((c) => c.id === entry.binds[0])
            return { results: found ? [found] : [] }
          }
          return { results: challenges.filter((c) => c.title === entry.binds[0]) }
        }
        if (/FROM book_challenge_attempts/.test(flat)) {
          return { results: state.attempts ? [state.attempts] : [] }
        }
        if (/FROM arsenals/.test(flat)) return { results: arsenals }
        if (/FROM book_text/.test(flat)) {
          // Lists arrive as JSON arrays opened with json_each (see bookStore).
          const keys = entry.binds.flatMap((b) => (typeof b === 'string' && b.startsWith('[') ? JSON.parse(b) : [b]))
          return {
            results: keys.filter((k) => k in book).map((k) => ({ key: k, text: book[k] })),
          }
        }
        return { results: [] }
      },
      run: async () => {
        state.writes.push(entry)
        if (/INSERT INTO book_access/.test(flat)) state.granted.push(entry.binds[1])
        if (/DELETE FROM book_challenge_attempts/.test(flat)) state.attempts = null
        if (/INSERT INTO book_challenge_attempts/.test(flat)) {
          state.attempts = state.attempts
            ? { ...state.attempts, failures: state.attempts.failures + 1, last_at: Date.now() }
            : { failures: 1, last_at: Date.now() }
        }
        return { meta: { changes: 1 } }
      },
    }
    return api
  }

  return { log, state, DB: { prepare: statement } }
}

const TITLE = 'the-silent-catalogue'

/** Hashed through the same function the authoring script uses. */
const challenge = async (over = {}) => ({
  id: 'chal_1',
  title: TITLE,
  question: 'What is the Rg of the Flask?',
  answer_hash: await hashAnswer('6'),
  ...over,
})

describe('normaliseAnswer', () => {
  /**
   * Somebody reading a stat off a page types what they see. None of these is a
   * different answer, and refusing them teaches the player that the app is
   * broken rather than that they are wrong.
   */
  it('forgives case, spacing and punctuation', () => {
    expect(normaliseAnswer('  Flask  ')).toBe('flask')
    expect(normaliseAnswer('FLASK.')).toBe('flask')
    expect(normaliseAnswer('3')).toBe(normaliseAnswer(' 3. '))
    expect(normaliseAnswer('Twin  Shield')).toBe('twin shield')
  })

  it('is empty for nothing at all', () => {
    expect(normaliseAnswer(null)).toBe('')
    expect(normaliseAnswer('   ...  ')).toBe('')
  })
})

describe('the challenge', () => {
  it('is not asked of somebody who has already proved it', async () => {
    const db = accessDB({ granted: [TITLE], challenges: [await challenge()] })
    expect(await getChallenge('u1', TITLE, db)).toBeNull()
  })

  it('is asked of somebody who has not', async () => {
    const db = accessDB({ challenges: [await challenge()] })
    const out = await getChallenge('u1', TITLE, db)
    expect(out.id).toBe('chal_1')
    expect(out.question).toMatch(/Flask/)
  })

  /** The one thing that must never leave the server. */
  it('never returns the answer hash', async () => {
    const db = accessDB({ challenges: [await challenge()] })
    const out = await getChallenge('u1', TITLE, db)
    const hash = (await challenge()).answer_hash
    expect(JSON.stringify(out)).not.toContain('answer_hash')
    expect(JSON.stringify(out)).not.toContain(hash)
  })

  it('is null when no question has been written for that title', async () => {
    const db = accessDB({ challenges: [] })
    expect(await getChallenge('u1', 'index-of-the-untold', db)).toBeNull()
  })

  it('refuses to run without a user', async () => {
    const db = accessDB()
    await expect(getChallenge(null, TITLE, db)).rejects.toThrow(/without a user/)
    await expect(answerChallenge('', 'chal_1', '6', db)).rejects.toThrow(/without a user/)
  })
})

describe('answering it', () => {
  it('grants access for the right answer, and never asks again', async () => {
    const db = accessDB({ challenges: [await challenge()] })
    const out = await answerChallenge('u1', 'chal_1', '6', db)
    expect(out.ok).toBe(true)
    expect(db.state.granted).toEqual([TITLE])
    expect(await getChallenge('u1', TITLE, db)).toBeNull()
  })

  it('accepts an answer typed the way a person types it', async () => {
    const db = accessDB({ challenges: [await challenge({ answer_hash: await hashAnswer('Flask') })] })
    expect((await answerChallenge('u1', 'chal_1', '  flask. ', db)).ok).toBe(true)
  })

  it('refuses a wrong answer and grants nothing', async () => {
    const db = accessDB({ challenges: [await challenge()] })
    const out = await answerChallenge('u1', 'chal_1', '7', db)
    expect(out.ok).toBe(false)
    expect(db.state.granted).toEqual([])
  })

  it('counts down the attempts that remain', async () => {
    const db = accessDB({ challenges: [await challenge()] })
    const first = await answerChallenge('u1', 'chal_1', 'wrong', db)
    expect(first.remaining).toBe(MAX_FAILURES - 1)
  })

  /**
   * Low-entropy answers make this the load-bearing half of the gate: a stat
   * line has perhaps a dozen plausible values, so unlimited attempts would not
   * be a challenge at all.
   */
  it('locks out after too many wrong answers', async () => {
    const db = accessDB({
      challenges: [await challenge()],
      attempts: { failures: MAX_FAILURES, last_at: Date.now() },
    })
    const out = await answerChallenge('u1', 'chal_1', '6', db)
    expect(out.ok).toBe(false)
    expect(out.lockedUntil).toBeGreaterThan(Date.now())
    // Even the *correct* answer is refused while locked out — otherwise the
    // limiter only slows down people who were going to fail anyway.
    expect(db.state.granted).toEqual([])
  })

  it('lets them back in once the lockout has expired', async () => {
    const db = accessDB({
      challenges: [await challenge()],
      attempts: { failures: MAX_FAILURES, last_at: Date.now() - LOCKOUT_MS - 1000 },
    })
    expect((await answerChallenge('u1', 'chal_1', '6', db)).ok).toBe(true)
  })

  /** Two fumbles then success must not leave somebody one slip from a lockout. */
  it('clears the failure count on success', async () => {
    const db = accessDB({
      challenges: [await challenge()],
      attempts: { failures: 3, last_at: Date.now() },
    })
    await answerChallenge('u1', 'chal_1', '6', db)
    expect(db.state.attempts).toBeNull()
  })

  it('refuses an unknown challenge id without touching anything', async () => {
    const db = accessDB({ challenges: [await challenge()] })
    const out = await answerChallenge('u1', 'chal_nope', '6', db)
    expect(out.ok).toBe(false)
    expect(db.state.granted).toEqual([])
    expect(db.state.writes).toHaveLength(0)
  })
})

describe('the text needs both gates', () => {
  const BALANCED = {
    doc: JSON.stringify({
      leader: {
        advancements: [{ id: 'a', tableId: 'action', tableValue: 9, name: 'Balanced Sword' }],
        // One box checked pays for one advancement. Without it the arsenal is
        // implausible and entitles nothing (audit v0.28.1 H2).
        experience: { boxesChecked: 1 },
      },
      equipment: [], injuries: [],
    }),
  }
  const KEY = 'advancement:action:9:Balanced Sword'

  /**
   * Proving you own the book does not hand you all 340 rows, and earning an
   * advancement does not entitle you to a book you have not shown. Neither gate
   * implies the other, and this is the test that says so.
   */
  it('gives nothing to somebody who has earned it but proved no title', async () => {
    const db = accessDB({ arsenals: [BALANCED], book: { [KEY]: 'text' } })
    expect(await getBookText('u1', [KEY], db)).toEqual({})
  })

  it('gives it once they have proved the title', async () => {
    const db = accessDB({ granted: [TITLE], arsenals: [BALANCED], book: { [KEY]: 'text' } })
    expect(await getBookText('u1', [KEY], db)).toEqual({ [KEY]: 'text' })
  })

  it('gives nothing for a title they have proved but an entry they have not earned', async () => {
    const db = accessDB({
      granted: [TITLE],
      arsenals: [{ doc: JSON.stringify({ leader: { advancements: [] }, equipment: [], injuries: [] }) }],
      book: { [KEY]: 'text' },
    })
    expect(await getBookText('u1', [KEY], db)).toEqual({})
  })
})
