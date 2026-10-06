/**
 * The client half of the crew builder's shared session (Phase B).
 *
 * Imports nothing from React (§6). The server holds the rules
 * (`functions/lib/encounterStore.js`): it seats two arsenals at one game and
 * will not send either crew until both have revealed. This file builds what is
 * revealed, and talks to `/api/encounters`.
 *
 * The crew itself is still hired locally, in `lib/encounter.js`, on the
 * player's own campaign document. Nothing here replaces that, and everything
 * here can fail without costing the player their crew: a shared session is an
 * addition to Phase A, never a dependency of it (§6, everything degrades).
 */

import {
  hiredModels, hireCostOf, hiredEquipment, crewCost, crewRating, encounterSizeOf,
  LEADER, TOTEM,
} from './encounter.js'

/**
 * What the opponent sees when both have revealed.
 *
 * Names, costs, who carries what, and the totals. Never ids, never rules text
 * (§4). The server rebuilds this field by field (`sanitiseCrew`), so a field
 * added here and not there is silently dropped; change both.
 */
export function crewSummary(encounter, arsenal, leader) {
  const totemName = encounter.totem && arsenal.totem ? (arsenal.totem.name || 'Totem') : null
  const byId = new Map(hiredModels(encounter, arsenal).map((m) => [m.id, m]))
  const holderName = (h) => (h === LEADER ? (leader?.name || 'Leader')
    : h === TOTEM ? totemName || 'Totem'
      : byId.get(h)?.name || '')
  return {
    leader: leader?.name || '',
    totem: totemName,
    models: [...byId.values()].map((m) => ({
      name: m.name,
      cost: hireCostOf(m, encounter),
      taxed: (encounter.taxed || []).includes(m.id),
    })),
    equipment: hiredEquipment(encounter, arsenal).map((x) => ({
      name: x.row.name,
      holder: holderName(x.holder),
    })),
    cost: crewCost(encounter, arsenal),
    rating: crewRating(encounter, arsenal),
    encounterSize: encounterSizeOf(encounter, arsenal),
    strategy: encounter.strategy || '',
  }
}

/** The shared session this local crew belongs to, from the server's list. */
export function sessionFor(encounter, sessions = []) {
  if (!encounter?.sharedId) return null
  return sessions.find((s) => s.id === encounter.sharedId) || null
}

/**
 * Sessions that ask for a crew this device has not started hiring.
 * An invitation, in the player's terms.
 */
export function invitations(sessions = [], campaign) {
  const linked = new Set((campaign?.encounters || []).map((e) => e.sharedId).filter(Boolean))
  return sessions.filter((s) => !linked.has(s.id) && !s.mine.revealed)
}

/** Where the session stands, as one word the screen can switch on. */
export function sessionStage(session) {
  if (!session) return 'gone'
  // Both revealed outranks their having left: they usually leave because they
  // recorded the game, and their crew is what this side needs to record theirs.
  if (session.mine.revealed && session.theirs.revealed) return 'both'
  if (session.theirs.left) return 'left'
  if (session.mine.revealed) return 'waiting'
  if (session.theirs.revealed) return 'theirs-ready'
  return 'hiring'
}

/**
 * Once both have revealed, their rating is known, and it decides the pool's
 * bonus. Fill it in rather than ask for it, unless the player already typed
 * one, which is theirs to keep.
 */
export function ratingPatch(encounter, session) {
  const theirs = session?.theirs?.crew
  if (!theirs || encounter.opponent?.rating != null) return null
  return { opponent: { ...encounter.opponent, rating: String(theirs.rating) } }
}

/** Both sides hire to one agreed size; say so when they did not. */
export function sizeDisagreement(encounter, arsenal, session) {
  const theirs = session?.theirs?.crew?.encounterSize
  const mine = encounterSizeOf(encounter, arsenal)
  if (theirs == null || mine == null || theirs === mine) return null
  return { mine, theirs }
}

/* ── the network ────────────────────────────────────────────────── */

const BASE = '/api/encounters'

export class SharedCrewError extends Error {
  constructor(message, { status } = {}) {
    super(message)
    this.name = 'SharedCrewError'
    this.status = status
    this.conflict = status === 409
  }
}

async function call(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch {
    throw new SharedCrewError('Could not reach the campaign service.')
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null)
    throw new SharedCrewError(detail?.message || `The campaign service returned ${res.status}.`, { status: res.status })
  }
  return res.json()
}

export const listSessions = (tableId, opts) => call(`?table=${encodeURIComponent(tableId)}`, opts)
export const openSession = ({ tableId, arsenalId, opponentArsenalId, week }) =>
  call('', { method: 'POST', body: { tableId, arsenalId, opponentArsenalId, week } })
export const reveal = (id, crew) => call(`/${encodeURIComponent(id)}/reveal`, { method: 'POST', body: { crew } })
export const closeSession = (id) => call(`/${encodeURIComponent(id)}/close`, { method: 'POST' })
