import { describe, it, expect } from 'vitest'
import { listArsenals, getArsenal, putArsenal, deleteArsenal } from './arsenalStore.js'

/**
 * Authorization tests for the arsenal.
 *
 * Same job as `campaignStore.test.js`, and the same reason: D1 has no
 * row-level security, so every guard here is a line somebody wrote on purpose,
 * and the hand-run version of these found a real hole in v0.7.0 — a signed-in
 * stranger wiping another player's `arsenal_models`, because that statement had
 * no owner column and so had never been given a guard.
 *
 * The fake D1 records every statement and its bindings, so a test asserts what
 * was actually **sent**, not what the code appears to say.
 */
function fakeDB({ first = null, all = [], changes = 0 } = {}) {
  const log = []
  const statement = (sql) => {
    const entry = { sql: sql.replace(/\s+/g, ' ').trim(), binds: [] }
    const api = {
      bind: (...binds) => { entry.binds = binds; log.push(entry); return api },
      first: async () => first,
      all: async () => ({ results: all }),
      run: async () => ({ meta: { changes } }),
    }
    return api
  }
  return { log, DB: { prepare: statement, batch: async (s) => s.map(() => ({})) } }
}

const ME = 'user_me'
const THEM = 'user_them'

const ARSENAL = {
  id: 'ars_1',
  schemaVersion: 3,
  campaignId: 'cmp_1',
  faction: 'neverborn',
  keywords: ['angler', 'banished'],
  scrip: 3,
  leader: { name: 'Cletus' },
  crewCard: { effect: 'x' },
  models: [
    { id: 'mdl_1', slug: 'tot', name: 'Terror Tot', cost: 4, addedWeek: 0 },
    { id: 'mdl_2', slug: 'nek', name: 'Nekima', cost: 13, addedWeek: 2 },
  ],
  injuries: [{ id: 'inj_1', name: 'Broken Arm' }],
  equipment: [],
  totem: null,
}

describe('nothing runs without a subject', () => {
  it('throws rather than querying across everybody', async () => {
    const db = fakeDB()
    await expect(listArsenals(null, db)).rejects.toThrow(/without a user/)
    await expect(getArsenal(undefined, 'ars_1', db)).rejects.toThrow(/without a user/)
    await expect(putArsenal('', ARSENAL, db)).rejects.toThrow(/without a user/)
    await expect(deleteArsenal(null, 'ars_1', db)).rejects.toThrow(/without a user/)
    expect(db.log).toHaveLength(0)
  })
})

describe('every read is scoped to the caller', () => {
  it('lists only this account, and only rows a v3 client has written', async () => {
    const db = fakeDB()
    await listArsenals(ME, db)
    expect(db.log[0].sql).toContain('WHERE user_id = ?')
    expect(db.log[0].sql).toContain('doc IS NOT NULL')
    expect(db.log[0].binds).toEqual([ME])
  })

  it('binds the caller on a single read too', async () => {
    const db = fakeDB()
    await getArsenal(ME, 'ars_1', db)
    expect(db.log[0].sql).toContain('WHERE id = ? AND user_id = ?')
    expect(db.log[0].binds).toEqual(['ars_1', ME])
  })

  it('reports a row it cannot parse as corrupt rather than as empty', async () => {
    // An unparseable row must never look like a good empty arsenal, or a merge
    // would let it replace a real one.
    const db = fakeDB({ all: [{ id: 'ars_1', doc: '{not json', updated_at: 5, version: 2 }] })
    const [row] = await listArsenals(ME, db)
    expect(row.corrupt).toBe(true)
    expect(row.version).toBe(2)
  })
})

describe('the ownership gate', () => {
  it('refuses a write to someone else’s arsenal, and writes NOTHING', async () => {
    const db = fakeDB({ first: { user_id: THEM, version: 1, schema_version: 3, has_doc: 1 } })
    const out = await putArsenal(ME, ARSENAL, db, { baseVersion: 1 })
    expect(out).toEqual({ forbidden: true })
    // Exactly one statement ran: the gate itself. In particular the DELETE that
    // clears arsenal_models never happened.
    expect(db.log).toHaveLength(1)
    expect(db.log[0].sql).toContain('SELECT user_id')
    expect(db.log.some((l) => l.sql.includes('DELETE'))).toBe(false)
  })

  it('takes the owner from the session, never from the payload', async () => {
    const db = fakeDB()
    await putArsenal(ME, { ...ARSENAL, ownerUserId: THEM, userId: THEM }, db)
    const insert = db.log.find((l) => l.sql.startsWith('INSERT INTO arsenals'))
    expect(insert.binds).toContain(ME)
    expect(insert.binds).not.toContain(THEM)
    // …and the ON CONFLICT re-asserts it, so an existing row cannot be hijacked
    // by posting a colliding id.
    expect(insert.sql).toContain('WHERE arsenals.user_id = ?')
  })

  it('scopes the destructive statement through a table that has an owner', async () => {
    const db = fakeDB()
    await putArsenal(ME, ARSENAL, db)
    const del = db.log.find((l) => l.sql.startsWith('DELETE FROM arsenal_models'))
    expect(del.sql).toContain('SELECT id FROM arsenals WHERE user_id = ?')
    expect(del.binds).toEqual(['ars_1', ME])
  })

  it('deletes only the caller’s own', async () => {
    const db = fakeDB({ changes: 1 })
    const out = await deleteArsenal(ME, 'ars_1', db)
    expect(db.log[0].sql).toContain('WHERE id = ? AND user_id = ?')
    expect(db.log[0].binds).toEqual(['ars_1', ME])
    expect(out.deleted).toBe(true)
  })
})

describe('the version gate', () => {
  it('refuses a client that has never seen the stored copy', async () => {
    const db = fakeDB({ first: { user_id: ME, version: 4, schema_version: 3, has_doc: 1 } })
    const out = await putArsenal(ME, ARSENAL, db, { baseVersion: null })
    expect(out).toMatchObject({ stale: true, serverVersion: 4 })
    expect(db.log).toHaveLength(1)
  })

  it('refuses a client naming any version but the current one', async () => {
    const db = fakeDB({ first: { user_id: ME, version: 4, schema_version: 3, has_doc: 1 } })
    expect(await putArsenal(ME, ARSENAL, db, { baseVersion: 3 })).toMatchObject({ stale: true })
    expect(await putArsenal(ME, ARSENAL, db, { baseVersion: 5 })).toMatchObject({ stale: true })
  })

  it('accepts an exact match and assigns the next version', async () => {
    const db = fakeDB({ first: { user_id: ME, version: 4, schema_version: 3, has_doc: 1 } })
    const out = await putArsenal(ME, ARSENAL, db, { baseVersion: 4 })
    expect(out.version).toBe(5)
  })

  it('lets a brand-new arsenal through — adoption has nothing to conflict with', async () => {
    const db = fakeDB({ first: null })
    const out = await putArsenal(ME, ARSENAL, db, { baseVersion: null })
    expect(out.version).toBe(1)
  })

  it('treats a NaN base as no base at all', async () => {
    const db = fakeDB({ first: { user_id: ME, version: 4, schema_version: 3, has_doc: 1 } })
    expect(await putArsenal(ME, ARSENAL, db, { baseVersion: NaN })).toMatchObject({ stale: true })
  })
})

describe('the shape gate', () => {
  it('refuses a write that would walk the shape backwards', async () => {
    // A tab left open from before the cutover holds an older document. The
    // version gate cannot catch it: a stale client that has pulled holds a
    // perfectly valid base version.
    const db = fakeDB({ first: { user_id: ME, version: 2, schema_version: 3, has_doc: 1 } })
    const out = await putArsenal(ME, { ...ARSENAL, schemaVersion: 2 }, db, { baseVersion: 2 })
    expect(out).toMatchObject({ outdatedShape: true, storedSchemaVersion: 3 })
    expect(db.log).toHaveLength(1)
  })

  it('allows the same shape, and a newer one', async () => {
    const db = fakeDB({ first: { user_id: ME, version: 2, schema_version: 3, has_doc: 1 } })
    expect((await putArsenal(ME, ARSENAL, db, { baseVersion: 2 })).version).toBe(3)
    const db2 = fakeDB({ first: { user_id: ME, version: 2, schema_version: 3, has_doc: 1 } })
    expect((await putArsenal(ME, { ...ARSENAL, schemaVersion: 4 }, db2, { baseVersion: 2 })).version).toBe(3)
  })
})

describe('what gets written', () => {
  it('stores the document whole and the columns as a projection', async () => {
    const db = fakeDB()
    await putArsenal(ME, ARSENAL, db)
    const insert = db.log.find((l) => l.sql.startsWith('INSERT INTO arsenals'))
    const doc = insert.binds.find((b) => typeof b === 'string' && b.startsWith('{"id":"ars_1"'))
    expect(JSON.parse(doc).models).toHaveLength(2)
    // The projection carries the columns the shared page reads.
    expect(insert.binds).toContain('neverborn')
    expect(insert.binds).toContain('angler')
    expect(insert.binds).toContain('banished')
  })

  it('totals only the models that can still be hired', async () => {
    const db = fakeDB()
    await putArsenal(ME, {
      ...ARSENAL,
      models: [
        { id: 'a', cost: 10 },
        { id: 'b', cost: 7, annihilated: true },
      ],
    }, db)
    const insert = db.log.find((l) => l.sql.startsWith('INSERT INTO arsenals'))
    expect(insert.binds).toContain(10)
    expect(insert.binds).not.toContain(17)
  })

  it('accepts an arsenal that is at no table', async () => {
    // Nullable since 0006. An unseated arsenal is an ordinary state, and the
    // campaign it names may not have been pushed yet.
    const db = fakeDB()
    await putArsenal(ME, { ...ARSENAL, campaignId: null }, db)
    const insert = db.log.find((l) => l.sql.startsWith('INSERT INTO arsenals'))
    expect(insert.binds[1]).toBeNull()
  })

  it('drops models with no id rather than writing junk rows', async () => {
    const db = fakeDB()
    await putArsenal(ME, { ...ARSENAL, models: [{ id: 'a', cost: 1 }, { cost: 2 }] }, db)
    const insert = db.log.find((l) => l.sql.startsWith('INSERT INTO arsenal_models'))
    expect(insert.binds.filter((b) => b === 'a')).toHaveLength(1)
    expect(insert.sql.match(/\(\?,\?,\?,\?,\?,\?,\?,\?,\?\)/g)).toHaveLength(1)
  })

  it('writes no model INSERT at all for an empty roster', async () => {
    const db = fakeDB()
    await putArsenal(ME, { ...ARSENAL, models: [] }, db)
    expect(db.log.some((l) => l.sql.startsWith('INSERT INTO arsenal_models'))).toBe(false)
    // …but the DELETE still runs, so clearing a roster actually clears it.
    expect(db.log.some((l) => l.sql.startsWith('DELETE FROM arsenal_models'))).toBe(true)
  })

  it('refuses an arsenal with no id, before touching anything', async () => {
    const db = fakeDB()
    expect(await putArsenal(ME, { scrip: 1 }, db)).toMatchObject({ invalid: expect.any(String) })
    expect(db.log).toHaveLength(0)
  })
})

describe('deleting an arsenal leaves the table standing', () => {
  it('touches campaigns not at all', async () => {
    // Other players may still be sitting there. Leaving is one player's act.
    const db = fakeDB({ changes: 1 })
    await deleteArsenal(ME, 'ars_1', db)
    expect(db.log.every((l) => !l.sql.includes('campaigns'))).toBe(true)
    expect(db.log).toHaveLength(1)
  })
})

describe('a row that is only a projection', () => {
  /**
   * Left behind by a v2 campaign push, which wrote the `arsenals` columns for
   * the shared page and had no arsenal document to store. Only a database with
   * real history has these — a fresh one never would, which is why this was
   * found by restoring the backup rather than by testing an empty schema.
   */
  const projectionOnly = { user_id: ME, version: 0, schema_version: 0, has_doc: 0 }

  it('accepts the first document without a base version', async () => {
    // The deadlock this fixes: the gate demanded baseVersion === 0, while
    // listArsenals hides doc IS NULL rows — so the client could not push
    // without a version it could not be told.
    const db = fakeDB({ first: projectionOnly })
    const out = await putArsenal(ME, ARSENAL, db, { baseVersion: null })
    expect(out.version).toBe(1)
    expect(out.stale).toBeUndefined()
  })

  it('still refuses one belonging to somebody else', async () => {
    const db = fakeDB({ first: { ...projectionOnly, user_id: THEM } })
    expect(await putArsenal(ME, ARSENAL, db, { baseVersion: null })).toEqual({ forbidden: true })
    expect(db.log).toHaveLength(1)
  })

  it('does not skip the shape gate once a document exists', async () => {
    const db = fakeDB({ first: { user_id: ME, version: 1, schema_version: 3, has_doc: 1 } })
    expect(await putArsenal(ME, { ...ARSENAL, schemaVersion: 2 }, db, { baseVersion: 1 }))
      .toMatchObject({ outdatedShape: true })
  })
})
