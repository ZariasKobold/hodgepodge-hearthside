import { describe, it, expect, beforeEach } from 'vitest'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  openSharedEncounter, listSharedEncounters, revealCrew, closeSeat,
  sanitiseCrew, MAX_OPEN_PER_USER, MAX_CREW_BYTES,
} from './encounterStore.js'
import { onRequest } from '../api/encounters/[[path]].js'
// Across the src/functions line (§6), in a test only: the client builds the
// summary and the server rebuilds it, and the two must keep agreeing.
import { crewSummary } from '../../src/lib/sharedCrew.js'
import { createEncounter } from '../../src/lib/encounter.js'
import { createArsenal, createLeader, createModel, createEquipment } from '../../src/lib/shape/arsenal.js'

/**
 * Attack tests for the shared hiring session — the first table where one
 * player's *hidden* data sits beside another's.
 *
 * Unlike the other store tests, these run against **real SQLite with every
 * migration applied**, through a thin D1 adapter (`node:sqlite`). A fake that
 * matches SQL strings can only confirm the query someone meant to write; this
 * runs the query that was written, with real joins, real foreign keys and the
 * real `CASE WHEN` that keeps an unrevealed crew in the database. That is the
 * clause the whole feature rests on, so it is the one a fake must not stand in
 * for.
 */

// Through `createRequire`, because Vite's resolver strips the `node:` prefix
// and does not know `sqlite` as a builtin yet.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite')

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

/** D1's surface — prepare/bind/first/all/run/batch — over node:sqlite. */
function d1() {
  const db = new DatabaseSync(':memory:')
  db.exec('PRAGMA foreign_keys = ON')
  for (const f of readdirSync(migrations).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(migrations, f), 'utf8'))
  }
  const plain = (row) => (row ? { ...row } : row)
  const prepare = (sql) => {
    let binds = []
    const api = {
      bind: (...b) => { binds = b; return api },
      first: async () => plain(db.prepare(sql).get(...binds)) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...binds).map(plain) }),
      run: async () => {
        const r = db.prepare(sql).run(...binds)
        return { meta: { changes: Number(r.changes) } }
      },
      _exec: () => db.prepare(sql).run(...binds),
    }
    return api
  }
  const batch = async (statements) => {
    db.exec('BEGIN')
    try {
      for (const s of statements) s._exec()
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    return statements.map(() => ({}))
  }
  return { db, env: { DB: { prepare, batch } } }
}

/**
 * The table: HOST runs it, MADS and FISH are admitted, PENDING is waiting at
 * the door, and STRANGER has an arsenal at another table entirely.
 */
const HOST = 'usr_host'
const MADS = 'usr_mads'
const FISH = 'usr_fish'
const PENDING = 'usr_pending'
const STRANGER = 'usr_stranger'
const TABLE = 'cmp_table'

function seed(db) {
  const now = 1
  for (const u of [HOST, MADS, FISH, PENDING, STRANGER]) {
    db.prepare(`INSERT INTO users (id, provider, provider_user_id, display_name, created_at)
                VALUES (?, 'discord', ?, ?, ?)`).run(u, u, u, now)
  }
  const camp = (id, owner, memberOf = null) => db.prepare(
    `INSERT INTO campaigns (id, name, owner_user_id, started_at, created_at, member_of)
     VALUES (?, '', ?, 1, 1, ?)`
  ).run(id, owner, memberOf)
  camp(TABLE, HOST)
  camp('cmp_mads', MADS, TABLE)
  camp('cmp_fish', FISH, TABLE)
  camp('cmp_pending', PENDING, TABLE)
  camp('cmp_elsewhere', STRANGER)
  camp('cmp_mads_spare', MADS)            // Mads's second leader, at no table

  const member = (u, status, nickname) => db.prepare(
    `INSERT INTO campaign_members (campaign_id, user_id, joined_at, status, nickname)
     VALUES (?, ?, 1, ?, ?)`
  ).run(TABLE, u, status, nickname)
  member(MADS, 'active', 'Mads')
  member(FISH, 'active', 'Fish')
  member(PENDING, 'pending', 'Waiting')

  const ars = (id, owner, campaign, leader) => db.prepare(
    `INSERT INTO arsenals (id, campaign_id, user_id, leader, updated_at) VALUES (?, ?, ?, ?, 1)`
  ).run(id, campaign, owner, JSON.stringify({ name: leader }))
  ars('ars_host', HOST, TABLE, 'Cletus')
  ars('ars_mads', MADS, 'cmp_mads', 'Lady J')
  ars('ars_fish', FISH, 'cmp_fish', 'Tukala')
  ars('ars_pending', PENDING, 'cmp_pending', 'Nobody')
  ars('ars_stranger', STRANGER, 'cmp_elsewhere', 'Outsider')
  ars('ars_mads_spare', MADS, 'cmp_mads_spare', 'Spare')
}

const CREW = {
  leader: 'Cletus', totem: null,
  models: [{ name: 'Sir Vantes', cost: 7, taxed: false }],
  equipment: [{ name: 'Duplicator', holder: 'Sir Vantes' }],
  cost: 7, rating: 3, encounterSize: 30, strategy: 'Plant Explosives',
}

let db, env
beforeEach(() => {
  ({ db, env } = d1())
  seed(db)
})

const open = (user = HOST, over = {}) => openSharedEncounter(user, {
  tableId: TABLE, arsenalId: 'ars_host', opponentArsenalId: 'ars_fish', week: 4, ...over,
}, env)

describe('the subject guard', () => {
  it('refuses to run any function without a user', async () => {
    await expect(openSharedEncounter('', {}, env)).rejects.toThrow(/without a user/)
    await expect(listSharedEncounters(undefined, TABLE, env)).rejects.toThrow(/without a user/)
    await expect(revealCrew(null, 'x', CREW, env)).rejects.toThrow(/without a user/)
    await expect(closeSeat('', 'x', env)).rejects.toThrow(/without a user/)
  })
})

describe('opening a session', () => {
  it('seats the host and a member at one game', async () => {
    const { id } = await open()
    expect(id).toMatch(/^shr_/)
    const seats = db.prepare('SELECT user_id, arsenal_id FROM encounter_crews WHERE encounter_id = ? ORDER BY user_id').all(id)
    expect(seats.map((s) => ({ ...s }))).toEqual([
      { user_id: FISH, arsenal_id: 'ars_fish' },
      { user_id: HOST, arsenal_id: 'ars_host' },
    ])
  })

  it('lets a member open one too, against the host', async () => {
    const r = await openSharedEncounter(MADS, {
      tableId: TABLE, arsenalId: 'ars_mads', opponentArsenalId: 'ars_host',
    }, env)
    expect(r.id).toBeTruthy()
  })

  it('refuses a stranger to the table', async () => {
    expect(await openSharedEncounter(STRANGER, {
      tableId: TABLE, arsenalId: 'ars_stranger', opponentArsenalId: 'ars_fish',
    }, env)).toEqual({ forbidden: true })
  })

  it('refuses a pending member, who is not in yet', async () => {
    expect(await openSharedEncounter(PENDING, {
      tableId: TABLE, arsenalId: 'ars_pending', opponentArsenalId: 'ars_fish',
    }, env)).toEqual({ forbidden: true })
  })

  it('refuses a pending member as the opponent', async () => {
    expect(await open(HOST, { opponentArsenalId: 'ars_pending' })).toEqual({ forbidden: true })
  })

  it('refuses to play with somebody else\'s arsenal as your own', async () => {
    expect(await open(HOST, { arsenalId: 'ars_mads', opponentArsenalId: 'ars_fish' })).toEqual({ forbidden: true })
  })

  it('refuses your own arsenal that is not at this table', async () => {
    expect(await openSharedEncounter(MADS, {
      tableId: TABLE, arsenalId: 'ars_mads_spare', opponentArsenalId: 'ars_fish',
    }, env)).toEqual({ forbidden: true })
  })

  it('refuses an opponent from another table', async () => {
    expect(await open(HOST, { opponentArsenalId: 'ars_stranger' })).toEqual({ forbidden: true })
  })

  it('refuses playing yourself, even with two of your own leaders', async () => {
    expect(await open(HOST, { opponentArsenalId: 'ars_host' })).toEqual({ error: 'bad-request' })
    db.prepare("UPDATE campaigns SET member_of = ? WHERE id = 'cmp_mads_spare'").run(TABLE)
    expect(await openSharedEncounter(MADS, {
      tableId: TABLE, arsenalId: 'ars_mads', opponentArsenalId: 'ars_mads_spare',
    }, env)).toEqual({ forbidden: true })
  })

  it('refuses an opponent who was removed but whose link survived', async () => {
    db.prepare('DELETE FROM campaign_members WHERE user_id = ?').run(FISH)
    expect(await open()).toEqual({ forbidden: true })
  })

  it('caps how many one player may leave open', async () => {
    for (let i = 0; i < MAX_OPEN_PER_USER; i += 1) await open()
    expect(await open()).toEqual({ error: 'too-many-open' })
  })

  it('writes nothing at all when it refuses', async () => {
    await open(STRANGER, { arsenalId: 'ars_stranger' })
    expect(db.prepare('SELECT COUNT(*) AS n FROM shared_encounters').get().n).toBe(0)
    expect(db.prepare('SELECT COUNT(*) AS n FROM encounter_crews').get().n).toBe(0)
  })
})

describe('hidden until both have revealed — the feature', () => {
  it('shows only that the other side has revealed, never what', async () => {
    const { id } = await open()
    await revealCrew(FISH, id, { ...CREW, leader: 'Tukala' }, env)

    const { encounters: [e] } = await listSharedEncounters(HOST, TABLE, env)
    expect(e.theirs.revealed).toBe(true)
    expect(e.theirs.crew).toBeNull()
  })

  it('shows both crews to both players once both have revealed', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, CREW, env)
    await revealCrew(FISH, id, { ...CREW, leader: 'Tukala', rating: 1 }, env)

    const host = (await listSharedEncounters(HOST, TABLE, env)).encounters[0]
    const fish = (await listSharedEncounters(FISH, TABLE, env)).encounters[0]
    expect(host.theirs.crew.leader).toBe('Tukala')
    expect(fish.theirs.crew.leader).toBe('Cletus')
    expect(fish.theirs.crew.rating).toBe(3)
  })

  it('always shows you your own revealed crew', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, CREW, env)
    const { encounters: [e] } = await listSharedEncounters(HOST, TABLE, env)
    expect(e.mine.revealed).toBe(true)
    expect(e.mine.crew.leader).toBe('Cletus')
  })

  it('shows a third player at the table nothing of a game they are not in', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, CREW, env)
    await revealCrew(FISH, id, CREW, env)
    expect((await listSharedEncounters(MADS, TABLE, env)).encounters).toEqual([])
  })

  it('refuses the list to a stranger and to a pending member', async () => {
    await open()
    expect(await listSharedEncounters(STRANGER, TABLE, env)).toEqual({ forbidden: true })
    expect(await listSharedEncounters(PENDING, TABLE, env)).toEqual({ forbidden: true })
  })

  it('never sends a user id, of either player', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, CREW, env)
    await revealCrew(FISH, id, CREW, env)
    const text = JSON.stringify(await listSharedEncounters(HOST, TABLE, env))
    for (const u of [HOST, FISH, MADS]) expect(text).not.toContain(u)
  })

  it('names the opponent by nickname and leader', async () => {
    await open()
    const { encounters: [e] } = await listSharedEncounters(HOST, TABLE, env)
    expect(e.theirs).toMatchObject({ nickname: 'Fish', leader: 'Tukala', revealed: false })
  })
})

describe('revealing', () => {
  it('writes your seat and never the other one', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, CREW, env)
    const fish = db.prepare('SELECT crew, revealed_at FROM encounter_crews WHERE encounter_id = ? AND user_id = ?').get(id, FISH)
    expect(fish.crew).toBeNull()
    expect(fish.revealed_at).toBeNull()
  })

  it('is once only: a revealed crew cannot be swapped after seeing theirs', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, CREW, env)
    await revealCrew(FISH, id, CREW, env)
    expect(await revealCrew(HOST, id, { ...CREW, cost: 99 }, env)).toEqual({ conflict: 'already-revealed' })
    const { encounters: [e] } = await listSharedEncounters(FISH, TABLE, env)
    expect(e.theirs.crew.cost).toBe(7)
  })

  it('cannot reveal for somebody else\'s seat', async () => {
    const { id } = await open()
    // Mads sits at the table but not at this game.
    expect(await revealCrew(MADS, id, CREW, env)).toEqual({ notFound: true })
    expect(await revealCrew(STRANGER, id, CREW, env)).toEqual({ notFound: true })
    const seats = db.prepare('SELECT crew FROM encounter_crews WHERE encounter_id = ?').all(id)
    expect(seats.every((s) => s.crew == null)).toBe(true)
  })

  it('refuses a player who has since been removed from the table', async () => {
    const { id } = await open()
    db.prepare('DELETE FROM campaign_members WHERE user_id = ?').run(FISH)
    expect(await revealCrew(FISH, id, CREW, env)).toEqual({ notFound: true })
  })

  it('refuses after closing the seat', async () => {
    const { id } = await open()
    await closeSeat(HOST, id, env)
    expect(await revealCrew(HOST, id, CREW, env)).toEqual({ notFound: true })
  })

  it('stores only the summary fields, rebuilt, never what was sent', async () => {
    const { id } = await open()
    await revealCrew(HOST, id, {
      ...CREW,
      description: 'rules text that must never be stored',
      models: [{ name: 'Sir Vantes', cost: 7, actions: ['Lance'], userId: FISH }],
      __proto__: { evil: true },
    }, env)
    const stored = db.prepare('SELECT crew FROM encounter_crews WHERE encounter_id = ? AND user_id = ?').get(id, HOST).crew
    expect(stored).not.toContain('rules text')
    expect(stored).not.toContain('Lance')
    expect(stored).not.toContain(FISH)
    expect(JSON.parse(stored).models).toEqual([{ name: 'Sir Vantes', cost: 7, taxed: false }])
  })

  it('refuses a crew that is not an object', async () => {
    const { id } = await open()
    expect(await revealCrew(HOST, id, 'everything', env)).toEqual({ error: 'bad-request' })
    expect(await revealCrew(HOST, id, [CREW], env)).toEqual({ error: 'bad-request' })
  })

  it('trims what is too long to be a real crew', () => {
    const huge = sanitiseCrew({ ...CREW, models: Array.from({ length: 500 }, () => ({ name: 'x'.repeat(500), cost: 1 })) })
    expect(huge.models).toHaveLength(60)
    expect(huge.models[0].name).toHaveLength(80)
    expect(JSON.stringify(huge).length).toBeLessThan(MAX_CREW_BYTES)
  })
})

describe('closing', () => {
  it('closes only your own seat, and the other side sees you left', async () => {
    const { id } = await open()
    expect(await closeSeat(HOST, id, env)).toEqual({ closed: true })
    expect((await listSharedEncounters(HOST, TABLE, env)).encounters).toEqual([])
    const { encounters: [e] } = await listSharedEncounters(FISH, TABLE, env)
    expect(e.theirs.left).toBe(true)
  })

  it('cannot close somebody else\'s seat', async () => {
    const { id } = await open()
    expect(await closeSeat(MADS, id, env)).toEqual({ notFound: true })
    expect((await listSharedEncounters(FISH, TABLE, env)).encounters[0].theirs.left).toBe(false)
  })
})

describe('erasure', () => {
  it('goes with the account that started it, both seats included', async () => {
    const { id } = await open()
    db.prepare('DELETE FROM arsenals WHERE user_id = ?').run(HOST)
    db.prepare('DELETE FROM campaign_members WHERE campaign_id = ?').run(TABLE)
    db.prepare('UPDATE campaigns SET member_of = NULL WHERE member_of = ?').run(TABLE)
    db.prepare('DELETE FROM campaigns WHERE owner_user_id = ?').run(HOST)
    db.prepare('DELETE FROM users WHERE id = ?').run(HOST)
    expect(db.prepare('SELECT COUNT(*) AS n FROM encounter_crews WHERE encounter_id = ?').get(id).n).toBe(0)
  })

  it('takes a player\'s seats with their account', async () => {
    await open()
    db.prepare('DELETE FROM arsenals WHERE user_id = ?').run(FISH)
    db.prepare('DELETE FROM campaign_members WHERE user_id = ?').run(FISH)
    db.prepare('DELETE FROM campaigns WHERE owner_user_id = ?').run(FISH)
    db.prepare('DELETE FROM users WHERE id = ?').run(FISH)
    expect(db.prepare('SELECT COUNT(*) AS n FROM encounter_crews WHERE user_id = ?').get(FISH).n).toBe(0)
  })
})

/* ── the route, over real HTTP shapes ───────────────────────────── */

describe('the route', () => {
  const ORIGIN = 'https://hodgepodgehearthside.com'
  const session = (user) => {
    db.prepare('INSERT OR IGNORE INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, 1, ?)')
      .run(`ses_${user}`, user, Date.now() + 1e9)
    return `hh_session=ses_${user}`
  }
  const call = (path, { user, method = 'GET', body, origin = ORIGIN } = {}) => {
    const url = new URL(`/api/encounters${path}`, ORIGIN)
    const headers = { ...(user ? { Cookie: session(user) } : {}), ...(origin ? { Origin: origin } : {}) }
    const seg = url.pathname.replace('/api/encounters', '').split('/').filter(Boolean)
    return onRequest({
      request: new Request(url, { method, headers, body: body ? JSON.stringify(body) : undefined }),
      env,
      params: { path: seg },
    })
  }

  it('refuses the signed out', async () => {
    expect((await call(`?table=${TABLE}`)).status).toBe(401)
  })

  it('refuses a cross-origin write before anything else', async () => {
    const res = await call('', { user: HOST, method: 'POST', origin: 'https://evil.example', body: {} })
    expect(res.status).toBe(403)
  })

  it('opens, hides, reveals and shows, end to end', async () => {
    const opened = await call('', {
      user: HOST, method: 'POST',
      body: { tableId: TABLE, arsenalId: 'ars_host', opponentArsenalId: 'ars_fish', week: 4 },
    })
    expect(opened.status).toBe(201)
    const { id } = await opened.json()

    expect((await call(`/${id}/reveal`, { user: FISH, method: 'POST', body: { crew: CREW } })).status).toBe(200)
    const hidden = await (await call(`?table=${TABLE}`, { user: HOST })).json()
    expect(hidden.encounters[0].theirs).toMatchObject({ revealed: true, crew: null })

    await call(`/${id}/reveal`, { user: HOST, method: 'POST', body: { crew: CREW } })
    const res = await call(`?table=${TABLE}`, { user: HOST })
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/)
    expect((await res.json()).encounters[0].theirs.crew.leader).toBe('Cletus')

    expect((await call(`/${id}/reveal`, { user: HOST, method: 'POST', body: { crew: CREW } })).status).toBe(409)
  })

  it('answers a stranger 404, never 403, whatever they ask', async () => {
    expect((await call(`?table=${TABLE}`, { user: STRANGER })).status).toBe(404)
    const { id } = await open()
    expect((await call(`/${id}/reveal`, { user: STRANGER, method: 'POST', body: { crew: CREW } })).status).toBe(404)
    expect((await call(`/${id}/close`, { user: STRANGER, method: 'POST' })).status).toBe(404)
  })
})

describe('the client summary and the server agree', () => {
  it('survives sanitising unchanged, so no field is silently dropped', () => {
    const leader = createLeader({ name: 'Cletus' })
    const arsenal = createArsenal({
      leader,
      keywords: ['angler', ''],
      models: [createModel({ id: 'm1', name: 'Sir Vantes', cost: 7, keywords: ['guard'] })],
      equipment: [createEquipment({ id: 'e1', name: 'Duplicator', equipmentId: 'duplicator' })],
    })
    const summary = crewSummary(createEncounter({
      modelIds: ['m1'], encounterSize: 20, strategy: 'Turf War',
      equipment: [{ rowId: 'e1', holder: 'm1' }],
    }), arsenal, leader)
    expect(sanitiseCrew(summary)).toEqual(summary)
  })
})

describe('the route before migration 0010 is applied', () => {
  it('lists nothing and refuses writes plainly, instead of a 500', async () => {
    db.exec('DROP TABLE encounter_crews; DROP TABLE shared_encounters;')
    db.prepare('INSERT OR IGNORE INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, 1, ?)')
      .run('ses_x', HOST, Date.now() + 1e9)
    const req = (method, path = '') => onRequest({
      request: new Request(`https://hodgepodgehearthside.com/api/encounters${path}`, {
        method,
        headers: { Cookie: 'hh_session=ses_x', Origin: 'https://hodgepodgehearthside.com' },
        body: method === 'POST' ? JSON.stringify({ tableId: TABLE, arsenalId: 'ars_host', opponentArsenalId: 'ars_fish' }) : undefined,
      }),
      env,
      params: { path: [] },
    })
    const list = await req('GET', `?table=${TABLE}`)
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({ encounters: [] })
    expect((await req('POST')).status).toBe(503)
  })
})
