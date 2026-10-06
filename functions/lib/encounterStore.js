/**
 * The crew builder's shared session: two players hiring for one game, hidden
 * from each other until both have revealed (p. 19).
 *
 * Phase B of `docs/data-model-v3.md` § "The crew builder". Phase A, the crew
 * itself, lives on each player's own device and campaign document; this module
 * only carries the two finished crews across, and only at the right moment.
 *
 * ## The rules
 *
 *   > **Open** a session only at a table you sit at, with your own arsenal,
 *   > against another player's arsenal at the same table.
 *   > **Write** only your own seat, once: a revealed crew cannot be changed.
 *   > **Read** your own seat always; the other seat's crew **only once both
 *   > have revealed.** Before that, only whether they have.
 *
 * The third rule is the feature. A crew builder that leaked the opponent's
 * list while you were still hiring would be a worse tool than a notebook
 * (`docs/data-model-v3.md`). It is enforced here, in the query that reads, not
 * by the client choosing not to look.
 *
 * ## The three things that stand in for row-level security (CLAUDE.md §12)
 *
 * 1. Every export takes `userId` first, and `requireSubject` throws without it.
 * 2. One gate before any write. Reveal's gate is its own `UPDATE … WHERE
 *    user_id = ? AND revealed_at IS NULL`, so there is no gap between checking
 *    and writing, and nobody can write a seat that is not theirs.
 * 3. `encounterStore.test.js` runs every function against real SQLite with
 *    every migration applied, and attacks it.
 *
 * ## What crosses
 *
 * Never a user id (the shared page's rule, `membershipStore.js`). The other
 * seat is named by its campaign nickname and its leader's name, both of which
 * that player already shows the table. Their crew summary is the only other
 * thing, and only after both reveal.
 *
 * ## Query budget
 *
 * Every function is a fixed handful of statements, never one per seat (§12b).
 */

import { roleIn } from './membershipStore.js'

function requireSubject(userId, fn) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error(`${fn} was called without a user — refusing to touch the database.`)
  }
  return userId
}

const canSit = (role) => role === 'owner' || role === 'active'

/** Open sessions one player may have started and not closed. Abuse ceiling. */
export const MAX_OPEN_PER_USER = 20
/** The largest crew summary accepted, in bytes of JSON. A real one is ~2 KB. */
export const MAX_CREW_BYTES = 16 * 1024

const id = () => `shr_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`

/* ── the crew summary, re-serialised field by field ─────────────── */

const str = (v, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '')
const int = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null)
const list = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn) : [])

/**
 * Only the fields a crew summary has, at sane lengths.
 *
 * The client builds this (`crewSummary` in `src/lib/sharedCrew.js`), but the
 * server does not store what it was sent: it stores what this function rebuilds
 * from it. So nothing else can ride along — no rules text (§4), no ids that
 * mean something elsewhere, no payload somebody hopes another client renders.
 * Mirrored on the client, which cannot import this (§6).
 */
export function sanitiseCrew(crew) {
  if (!crew || typeof crew !== 'object' || Array.isArray(crew)) return null
  return {
    leader: str(crew.leader),
    totem: crew.totem ? str(crew.totem) : null,
    models: list(crew.models, 60, (m) => ({
      name: str(m?.name),
      cost: int(m?.cost) ?? 0,
      taxed: Boolean(m?.taxed),
    })),
    equipment: list(crew.equipment, 60, (e) => ({
      name: str(e?.name),
      holder: str(e?.holder),
    })),
    cost: int(crew.cost) ?? 0,
    rating: int(crew.rating) ?? 0,
    encounterSize: int(crew.encounterSize),
    strategy: str(crew.strategy, 120),
  }
}

/* ── open ───────────────────────────────────────────────────────── */

/**
 * Seat two arsenals at one game.
 *
 * The caller's arsenal must be theirs and sit at the table; the opponent's must
 * belong to somebody else who is still at the table. "Sits at the table" means
 * what the shared page means by it (`listSharedArsenals`): its campaign is the
 * table, or points at it with `member_of`.
 */
export async function openSharedEncounter(userId, { tableId, arsenalId, opponentArsenalId, week } = {}, env) {
  requireSubject(userId, 'openSharedEncounter')
  if (typeof tableId !== 'string' || typeof arsenalId !== 'string' || typeof opponentArsenalId !== 'string') {
    return { error: 'bad-request' }
  }
  if (arsenalId === opponentArsenalId) return { error: 'bad-request' }

  const role = await roleIn(userId, tableId, env)
  if (!canSit(role)) return { forbidden: true }

  // Both arsenals in one read, with where each sits.
  const { results } = await env.DB.prepare(
    `SELECT a.id, a.user_id, a.campaign_id, c.member_of
       FROM arsenals a
       JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.id IN (?, ?)`
  ).bind(arsenalId, opponentArsenalId).all()
  const byId = new Map((results || []).map((r) => [r.id, r]))
  const mine = byId.get(arsenalId)
  const theirs = byId.get(opponentArsenalId)
  const atTable = (r) => r && (r.campaign_id === tableId || r.member_of === tableId)

  if (!atTable(mine) || mine.user_id !== userId) return { forbidden: true }
  if (!atTable(theirs) || theirs.user_id === userId) return { forbidden: true }
  // Their link could outlive their membership if anything ever forgot to clear
  // it. The role is the authority, not the pointer.
  if (!canSit(await roleIn(theirs.user_id, tableId, env))) return { forbidden: true }

  const { results: open } = await env.DB.prepare(
    `SELECT COUNT(*) AS n
       FROM shared_encounters e
       JOIN encounter_crews s ON s.encounter_id = e.id AND s.user_id = e.created_by
      WHERE e.created_by = ? AND s.closed_at IS NULL`
  ).bind(userId).all()
  if ((open?.[0]?.n ?? 0) >= MAX_OPEN_PER_USER) return { error: 'too-many-open' }

  const encounterId = id()
  const now = Date.now()
  // One batch: a session with one seat is not a state that may exist.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO shared_encounters (id, table_id, created_by, week, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(encounterId, tableId, userId, int(week), now),
    env.DB.prepare(
      `INSERT INTO encounter_crews (encounter_id, user_id, arsenal_id) VALUES (?, ?, ?)`
    ).bind(encounterId, userId, arsenalId),
    env.DB.prepare(
      `INSERT INTO encounter_crews (encounter_id, user_id, arsenal_id) VALUES (?, ?, ?)`
    ).bind(encounterId, theirs.user_id, opponentArsenalId),
  ])
  return { id: encounterId }
}

/* ── read ───────────────────────────────────────────────────────── */

/**
 * Every open session at this table that the caller has a seat in.
 *
 * The other seat's `crew` is selected **in SQL** only when both seats have
 * revealed, so an unrevealed crew never leaves the database, let alone this
 * function. Two statements beside the gate.
 */
export async function listSharedEncounters(userId, tableId, env) {
  requireSubject(userId, 'listSharedEncounters')
  const role = await roleIn(userId, tableId, env)
  if (!canSit(role)) return { forbidden: true }

  const { results } = await env.DB.prepare(
    `SELECT e.id, e.week, e.created_at, e.created_by = ? AS started_by_me,
            me.arsenal_id   AS my_arsenal,  me.crew AS my_crew,  me.revealed_at AS my_revealed,
            them.arsenal_id AS their_arsenal, them.revealed_at AS their_revealed,
            them.closed_at  AS their_closed,
            CASE WHEN me.revealed_at IS NOT NULL AND them.revealed_at IS NOT NULL
                 THEN them.crew END AS their_crew,
            them.user_id    AS their_user,
            a.leader        AS their_leader
       FROM shared_encounters e
       JOIN encounter_crews me   ON me.encounter_id = e.id AND me.user_id = ?
       JOIN encounter_crews them ON them.encounter_id = e.id AND them.user_id != ?
       LEFT JOIN arsenals a      ON a.id = them.arsenal_id
      WHERE e.table_id = ? AND me.closed_at IS NULL
      ORDER BY e.created_at DESC`
  ).bind(userId, userId, userId, tableId).all()

  const rows = results || []
  if (rows.length === 0) return { encounters: [] }

  // Nicknames, the only identity that crosses (membershipStore.js).
  const { results: names } = await env.DB.prepare(
    `SELECT user_id, nickname FROM campaign_members WHERE campaign_id = ?`
  ).bind(tableId).all()
  const nickname = new Map((names || []).map((n) => [n.user_id, n.nickname || '']))

  return {
    encounters: rows.map((r) => ({
      id: r.id,
      week: r.week,
      createdAt: r.created_at,
      startedByMe: Boolean(r.started_by_me),
      mine: {
        arsenalId: r.my_arsenal,
        revealed: r.my_revealed != null,
        crew: parse(r.my_crew),
      },
      theirs: {
        arsenalId: r.their_arsenal,
        nickname: nickname.get(r.their_user) || '',
        leader: parse(r.their_leader)?.name || '',
        revealed: r.their_revealed != null,
        left: r.their_closed != null,
        crew: parse(r.their_crew),
      },
    })),
  }
}

function parse(text) {
  if (text == null) return null
  try { return JSON.parse(text) } catch { return null }
}

/* ── reveal ─────────────────────────────────────────────────────── */

/**
 * Reveal the caller's crew. Once.
 *
 * The UPDATE is the gate: it touches only the caller's own seat, only while it
 * is unrevealed and open, and only while they still sit at the table. Zero rows
 * changed is answered as `conflict` when the seat exists and was already
 * revealed, and as not found otherwise, so a stranger learns nothing about a
 * session id they guessed.
 */
export async function revealCrew(userId, encounterId, crew, env) {
  requireSubject(userId, 'revealCrew')
  const clean = sanitiseCrew(crew)
  if (!clean) return { error: 'bad-request' }
  const body = JSON.stringify(clean)
  if (body.length > MAX_CREW_BYTES) return { error: 'too-large' }

  const seat = await env.DB.prepare(
    `SELECT e.table_id, s.revealed_at, s.closed_at
       FROM shared_encounters e
       JOIN encounter_crews s ON s.encounter_id = e.id AND s.user_id = ?
      WHERE e.id = ?`
  ).bind(userId, String(encounterId || '')).first()
  if (!seat) return { notFound: true }
  if (!canSit(await roleIn(userId, seat.table_id, env))) return { notFound: true }
  if (seat.revealed_at != null) return { conflict: 'already-revealed' }
  if (seat.closed_at != null) return { notFound: true }

  const result = await env.DB.prepare(
    `UPDATE encounter_crews SET crew = ?, revealed_at = ?
      WHERE encounter_id = ? AND user_id = ? AND revealed_at IS NULL AND closed_at IS NULL`
  ).bind(body, Date.now(), encounterId, userId).run()
  if ((result.meta?.changes ?? 0) === 0) return { conflict: 'already-revealed' }
  return { revealed: true }
}

/* ── close ──────────────────────────────────────────────────────── */

/**
 * Leave a session: the game was played and logged, or it is not happening.
 * Own seat only, and needs no role, because it only ever closes the caller's
 * own row. The other player sees `left` and can close theirs.
 */
export async function closeSeat(userId, encounterId, env) {
  requireSubject(userId, 'closeSeat')
  const result = await env.DB.prepare(
    `UPDATE encounter_crews SET closed_at = ?
      WHERE encounter_id = ? AND user_id = ? AND closed_at IS NULL`
  ).bind(Date.now(), String(encounterId || ''), userId).run()
  if ((result.meta?.changes ?? 0) === 0) return { notFound: true }
  return { closed: true }
}
