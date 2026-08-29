import { describe, it, expect } from 'vitest'
import {
  listCampaigns, getCampaign, putCampaign, deleteCampaign, deleteAccount,
} from './campaignStore.js'

/**
 * Authorization tests.
 *
 * D1 has no row-level security, so nothing under this code stops one player
 * reading or destroying another's data — every guard is a line in
 * `campaignStore.js`. That makes these the most important tests in the project,
 * and they exist because the hand-run version of them found a real hole: a
 * signed-in stranger could delete another player's `arsenal_models` rows,
 * because that statement had no owner column and so had never been given a
 * guard.
 *
 * A fake D1 records every statement and its bindings, so a test can assert what
 * was actually sent rather than what the code appears to say.
 */
function fakeDB({ rows = {} } = {}) {
  const log = []

  const statement = (sql) => {
    const entry = { sql: sql.replace(/\s+/g, ' ').trim(), binds: [] }
    const api = {
      bind: (...binds) => { entry.binds = binds; log.push(entry); return api },
      first: async () => rows.first ?? null,
      all: async () => ({ results: rows.all ?? [] }),
      run: async () => ({ meta: { changes: rows.changes ?? 0 } }),
      _entry: entry,
    }
    return api
  }

  return {
    log,
    DB: {
      prepare: statement,
      batch: async (statements) => statements.map(() => ({})),
    },
  }
}

const CAMPAIGN = {
  id: 'cmp_1',
  schemaVersion: 2,
  arsenals: [{
    id: 'ars_1',
    faction: 'neverborn',
    keywords: ['angler', 'banished'],
    scrip: 3,
    leader: { name: 'Someone' },
    crewCard: {},
    models: [{ id: 'mdl_1', slug: 'x', name: 'X', cost: 4, addedWeek: 0 }],
  }],
}

describe('every read is scoped to the caller', () => {
  it('lists only the caller’s campaigns', async () => {
    const db = fakeDB()
    await listCampaigns('usr_a', db)
    expect(db.log).toHaveLength(1)
    expect(db.log[0].sql).toContain('WHERE owner_user_id = ?')
    expect(db.log[0].binds).toEqual(['usr_a'])
  })

  it('fetches one campaign only when the caller owns it', async () => {
    const db = fakeDB()
    await getCampaign('usr_a', 'cmp_1', db)
    expect(db.log[0].sql).toContain('WHERE id = ? AND owner_user_id = ?')
    expect(db.log[0].binds).toEqual(['cmp_1', 'usr_a'])
  })

  it('deletes only the caller’s campaign', async () => {
    const db = fakeDB()
    await deleteCampaign('usr_a', 'cmp_1', db)
    expect(db.log[0].sql).toContain('WHERE id = ? AND owner_user_id = ?')
    expect(db.log[0].binds).toEqual(['cmp_1', 'usr_a'])
  })
})

describe('writing someone else’s campaign', () => {
  it('is refused before a single statement runs', async () => {
    // The row exists and belongs to someone else.
    const db = fakeDB({ rows: { first: { owner_user_id: 'usr_owner' } } })
    const result = await putCampaign('usr_intruder', CAMPAIGN, db)

    expect(result).toEqual({ forbidden: true })
    // Exactly one statement: the ownership check. Nothing was written, and
    // crucially nothing was deleted — this is the regression that mattered.
    expect(db.log).toHaveLength(1)
    expect(db.log[0].sql).toContain('SELECT owner_user_id FROM campaigns')
    expect(db.log.some((e) => /DELETE/i.test(e.sql))).toBe(false)
  })

  it('allows the owner through', async () => {
    const db = fakeDB({ rows: { first: { owner_user_id: 'usr_owner' } } })
    const result = await putCampaign('usr_owner', CAMPAIGN, db)
    expect(result.forbidden).toBeUndefined()
    expect(result.id).toBe('cmp_1')
  })

  it('allows a campaign that does not exist yet', async () => {
    const db = fakeDB({ rows: { first: null } })
    const result = await putCampaign('usr_new', CAMPAIGN, db)
    expect(result.forbidden).toBeUndefined()
  })
})

describe('the destructive statement carries a scope of its own', () => {
  it('scopes the arsenal_models delete through arsenals, not just the gate', async () => {
    const db = fakeDB({ rows: { first: null } })
    await putCampaign('usr_a', CAMPAIGN, db)

    const del = db.log.find((e) => /DELETE FROM arsenal_models/i.test(e.sql))
    expect(del).toBeDefined()
    // Defence in depth: the row has no owner column, so it borrows one.
    expect(del.sql).toContain('SELECT id FROM arsenals WHERE campaign_id = ? AND user_id = ?')
    expect(del.binds).toEqual(['ars_1', 'cmp_1', 'usr_a'])
  })

  it('never writes an owner taken from the payload', async () => {
    const db = fakeDB({ rows: { first: null } })
    // A client trying to file this under somebody else.
    await putCampaign('usr_a', { ...CAMPAIGN, owner_user_id: 'usr_victim', ownerUserId: 'usr_victim' }, db)

    const insert = db.log.find((e) => /INSERT INTO campaigns/i.test(e.sql))
    expect(insert.binds).toContain('usr_a')
    expect(insert.binds).not.toContain('usr_victim')
  })
})

describe('a call with no subject is refused outright', () => {
  /* The guard that stands in for the part of RLS that catches mistakes: a
     missing user must not become a query across everybody's rows. */
  const cases = [
    ['listCampaigns', (u, db) => listCampaigns(u, db)],
    ['getCampaign', (u, db) => getCampaign(u, 'cmp_1', db)],
    ['putCampaign', (u, db) => putCampaign(u, CAMPAIGN, db)],
    ['deleteCampaign', (u, db) => deleteCampaign(u, 'cmp_1', db)],
    ['deleteAccount', (u, db) => deleteAccount(u, db)],
  ]

  for (const [name, run] of cases) {
    it(`${name} throws rather than running unscoped`, async () => {
      for (const bad of [undefined, null, '', 0, {}]) {
        const db = fakeDB()
        await expect(run(bad, db)).rejects.toThrow(/without a user/)
        expect(db.log).toHaveLength(0)
      }
    })
  }
})

describe('deleting an account', () => {
  it('removes the campaigns, the arsenals, the models, the sessions and the user', async () => {
    const db = fakeDB({ rows: { all: [{ id: 'cmp_1' }, { id: 'cmp_2' }] } })
    const result = await deleteAccount('usr_a', db)

    expect(result).toEqual({ deletedCampaigns: 2 })
    const sql = db.log.map((e) => e.sql).join(' | ')
    expect(sql).toContain('DELETE FROM arsenal_models')
    expect(sql).toContain('DELETE FROM arsenals')
    expect(sql).toContain('DELETE FROM campaigns')
    expect(sql).toContain('DELETE FROM sessions')
    expect(sql).toContain('DELETE FROM users')
  })

  it('erases the user even when they own nothing', async () => {
    const db = fakeDB({ rows: { all: [] } })
    await deleteAccount('usr_a', db)
    const sql = db.log.map((e) => e.sql).join(' | ')
    expect(sql).toContain('DELETE FROM users')
    expect(sql).toContain('DELETE FROM sessions')
  })

  it('never deletes a user other than the caller', async () => {
    const db = fakeDB({ rows: { all: [] } })
    await deleteAccount('usr_a', db)
    for (const entry of db.log) {
      expect(entry.binds).not.toContain('usr_b')
      expect(entry.binds.some((b) => b === 'usr_a')).toBe(true)
    }
  })
})
