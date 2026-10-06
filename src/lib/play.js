/**
 * Playing the game with the crew that was hired: the table-side tracker.
 *
 * Owner request, Session 77: the crew builder should be useful *during* the
 * game, the way Wyrd's own crew builder app is — health, conditions, who has
 * activated, the soulstone pool, the turn and the score. Pure (§6); the screen
 * is `components/steps/PlayTracker.jsx`.
 *
 * ## What it is, and what it is not
 *
 * - **A tally, not a referee.** It holds numbers the player changes. It never
 *   decides that damage was dealt, a condition expired or a scheme scored.
 *   The app owns no fate deck (§ aftermath), and it owns no game either.
 * - **Kept on this device only** (`usePlay`), not on the campaign document.
 *   A health tap is many writes a turn, and every campaign write is a push to
 *   the account. What the campaign needs from the game — the score and who
 *   died — is written to the encounter once, at the end (`playFacts`).
 * - **Condition names are names**, typed or picked from a short list. Never
 *   what a condition does (§4).
 *
 * ## Units
 *
 * Everyone on the table for this crew is a *unit*, keyed by:
 *   `leader`, `totem`, an arsenal model's id, or a summon's own `smn_` id.
 * A summon is not in the arsenal and never will be: it cannot be killed into
 * the injury phase, and it is dropped from `playFacts`.
 */

import { uid } from './shape/arsenal.js'
import { LEADER, TOTEM } from './encounter.js'

/** A Malifaux game runs five turns unless something ends it early. */
export const TURNS = 5

/**
 * Condition names offered by the picker. Names only, never rules text (§4).
 * Anything else can be typed, since a card may name its own.
 */
export const COMMON_CONDITIONS = [
  'Adversary', 'Burning', 'Distracted', 'Fast', 'Focused', 'Injured',
  'Poison', 'Shielded', 'Slow', 'Staggered', 'Stunned',
]

/** A fresh game. `pool` is the starting soulstone pool, when it is known. */
export function createPlay({ pool = 0, encounterId = null } = {}) {
  return {
    encounterId,
    startedAt: Date.now(),
    turn: 1,
    pool: Math.max(0, Number(pool) || 0),
    vp: { strategy: 0, schemes: 0, schemesScored: 0, opponent: 0 },
    units: {},
    summons: [],
    over: false,
  }
}

/** A unit's state, with defaults for one nothing has happened to yet. */
export function unitOf(play, key) {
  return {
    damage: 0,
    activated: false,
    killed: false,
    conditions: [],
    maxHealth: null,
    ...(play?.units?.[key] || {}),
  }
}

/** Patch one unit, returning the whole play. */
function withUnit(play, key, fn) {
  const before = unitOf(play, key)
  return { ...play, units: { ...play.units, [key]: { ...before, ...fn(before) } } }
}

/**
 * The health a unit has left, given its maximum.
 * `max` is the card's, unless the player typed one for this unit.
 */
export function healthLeft(play, key, cardMax = null) {
  const u = unitOf(play, key)
  const max = u.maxHealth ?? cardMax
  if (max == null) return null
  return Math.max(0, max - u.damage)
}

/** The maximum in force for a unit: the player's, else the card's. */
export function maxHealthOf(play, key, cardMax = null) {
  return unitOf(play, key).maxHealth ?? cardMax ?? null
}

/**
 * Take damage (positive) or heal (negative). Never below zero damage, and
 * never past the maximum when one is known. Reaching zero health does not
 * mark the unit killed: plenty of things happen at zero, and the player says
 * when a model is removed.
 */
export function damage(play, key, delta, cardMax = null) {
  return withUnit(play, key, (u) => {
    const max = u.maxHealth ?? cardMax
    let next = u.damage + delta
    if (max != null) next = Math.min(next, max)
    return { damage: Math.max(0, next) }
  })
}

/** A maximum typed for one unit, for a card the app cannot read. */
export function setMaxHealth(play, key, value) {
  const n = value === '' || value == null ? null : Number(value)
  return withUnit(play, key, () => ({ maxHealth: Number.isFinite(n) && n > 0 ? n : null }))
}

export function toggleActivated(play, key) {
  return withUnit(play, key, (u) => ({ activated: !u.activated }))
}

/** Killed is the player's word, and taking it back restores nothing else. */
export function toggleKilled(play, key) {
  return withUnit(play, key, (u) => ({ killed: !u.killed, activated: u.killed ? u.activated : false }))
}

/** Add a condition, or add to its value if the unit already has it. */
export function addCondition(play, key, name, value = 1) {
  const clean = String(name || '').trim()
  if (!clean) return play
  const n = Number(value) || 0
  return withUnit(play, key, (u) => {
    const found = u.conditions.find((c) => c.name.toLowerCase() === clean.toLowerCase())
    if (found) {
      return { conditions: u.conditions.map((c) => (c === found ? { ...c, value: c.value + n } : c)) }
    }
    return { conditions: [...u.conditions, { name: clean, value: n }] }
  })
}

/** Change a condition's value. At zero or below it is removed. */
export function changeCondition(play, key, name, delta) {
  return withUnit(play, key, (u) => ({
    conditions: u.conditions
      .map((c) => (c.name === name ? { ...c, value: c.value + delta } : c))
      .filter((c) => c.name !== name || c.value > 0),
  }))
}

export function removeCondition(play, key, name) {
  return withUnit(play, key, (u) => ({ conditions: u.conditions.filter((c) => c.name !== name) }))
}

/**
 * The next turn: every unit is ready to activate again. Nothing else changes,
 * because what ends at the end of a turn is a rules question (§4) and the
 * player answers it on the board.
 */
export function nextTurn(play) {
  const units = {}
  for (const [k, u] of Object.entries(play.units)) units[k] = { ...u, activated: false }
  return { ...play, turn: play.turn + 1, units }
}

/** Back a turn, for a mis-tap. Activations are left as they are. */
export function previousTurn(play) {
  return { ...play, turn: Math.max(1, play.turn - 1) }
}

export function adjustPool(play, delta) {
  return { ...play, pool: Math.max(0, play.pool + delta) }
}

/** Strategy, schemes or the opponent's score, never below zero. */
export function adjustVp(play, field, delta) {
  if (!(field in play.vp)) return play
  return { ...play, vp: { ...play.vp, [field]: Math.max(0, play.vp[field] + delta) } }
}

/** This crew's score. */
export function vpTotal(play) {
  return play.vp.strategy + play.vp.schemes
}

/**
 * A model that arrives partway through. Named, and read off the register when
 * it has a slug; its health is the card's, or typed.
 */
export function addSummon(play, { name, slug = null, maxHealth = null }) {
  const clean = String(name || '').trim()
  if (!clean) return play
  const id = uid('smn')
  const next = { ...play, summons: [...play.summons, { id, name: clean, slug }] }
  return maxHealth ? setMaxHealth(next, id, maxHealth) : next
}

export function removeSummon(play, id) {
  const units = { ...play.units }
  delete units[id]
  return { ...play, summons: play.summons.filter((s) => s.id !== id), units }
}

/** How many units have activated this turn, out of how many are still in. */
export function activationCount(play, keys) {
  const standing = keys.filter((k) => !unitOf(play, k).killed)
  return {
    done: standing.filter((k) => unitOf(play, k).activated).length,
    of: standing.length,
  }
}

/**
 * What the campaign needs from the game, for the game log.
 *
 * Only arsenal models can be killed into the injury phase, so summons are
 * dropped and so is the totem (it carries no injuries in this app). Peons are
 * dropped too: they never flip (p. 37). The result is offered, not decided —
 * a draw or a forfeit is the player's to say.
 */
export function playFacts(play, { hiredModels = [] } = {}) {
  const killedModelIds = hiredModels
    .filter((m) => !m.peon && unitOf(play, m.id).killed)
    .map((m) => m.id)
  const self = vpTotal(play)
  const opp = play.vp.opponent
  return {
    vpSelf: self,
    vpOpponent: opp,
    // The game log offers 0–3: three is the ceiling the aftermath hand reads.
    schemesCompleted: Math.min(3, play.vp.schemesScored),
    killedModelIds,
    leaderWasKilled: unitOf(play, LEADER).killed,
    result: self > opp ? 'win' : self < opp ? 'loss' : 'draw',
  }
}

export { LEADER, TOTEM }
