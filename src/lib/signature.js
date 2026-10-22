/**
 * Which of a leader's actions are signature actions, and how the app knows.
 *
 * p. 17: a chosen action "retains the same skill (Skl) and any signature
 * symbol". So a leader's action is signature for one of three reasons, and
 * this module is the one place that asks all three:
 *
 *   1. A Signature advancement was put on it (pp. 40, 43). Book data, and it
 *      wins over everything: once taken, the action is signature.
 *   2. It was gained from the tier-2 Action table, which prints the glyph on
 *      26 of its 73 actions (`isSignature` in `data/advancements.js`).
 *   3. It was chosen from an ally's card at creation. **The player says so.**
 *
 * The third is answered by the player because the register cannot answer it.
 * BiggerHat's `is_signature` comes back `false` for actions that are printed
 * signature — Aunty Mel's Inclement Weather and Life Raft, and every action on
 * four Bayou masters checked on 2026-10-22 — and it is the only field their API
 * has for it. Reading it would print "not signature" on actions that are, which
 * is worse than printing nothing, because a reader believes it. So this module
 * never reads it, and a chosen action nobody has answered for is `null`:
 * unknown, never false.
 *
 * The answer is a symbol on the card, a fact of the same kind as Skl or cost,
 * so it is stored on the pick (§4 forbids rules text, not facts).
 *
 * Imports nothing from React (§6).
 */
import { advancementsOn, gainedActionKey, rowFor } from './advancement.js'

/** Abilities have no signature symbol. Only actions are asked. */
export const SIGNATURE_SLOTS = ['attack', 'tactical']

/** The player's answer on one pick: true, false, or null if never asked. */
export function pickSignature(pick) {
  return typeof pick?.signature === 'boolean' ? pick.signature : null
}

/** Whether any advancement on this action makes it signature. */
function madeSignature(holder, key) {
  return advancementsOn(holder, key).some((a) => rowFor(a)?.signature)
}

/**
 * A chosen action's signature, with where the answer came from.
 *
 * `source` is `advancement`, `player` or null. Kept beside the answer because a
 * reader of the export should be able to tell a fact the book settles from one
 * a player typed.
 */
export function leaderSignature(leader, pick) {
  if (!pick) return { signature: null, source: null }
  if (madeSignature(leader, pick.key)) return { signature: true, source: 'advancement' }
  const answer = pickSignature(pick)
  return answer === null ? { signature: null, source: null } : { signature: answer, source: 'player' }
}

/**
 * A gained tier-2 action's signature: printed in the book, or made so by an
 * advancement.
 *
 * The joker's free choice has no row of its own to read, and an ambiguous old
 * record resolves to no row (`rowFor`), so both are null rather than false.
 */
export function gainedSignature(leader, adv) {
  if (madeSignature(leader, gainedActionKey(adv))) return { signature: true, source: 'advancement' }
  const row = rowFor(adv)
  if (!row?.kind) return { signature: null, source: null }
  return { signature: Boolean(row.isSignature), source: 'book' }
}

/**
 * Chosen actions whose signature nobody has answered for.
 *
 * Every leader built before v0.36.0 has these, since the question was never
 * asked. An action a Signature advancement already covers is left out: the
 * answer is known, and asking would invite a "no" that changes nothing.
 */
export function unansweredSignatures(leader) {
  const out = []
  for (const slot of SIGNATURE_SLOTS) {
    for (const pick of leader?.picks?.[slot] || []) {
      if (leaderSignature(leader, pick).signature === null) out.push({ slot, pick })
    }
  }
  return out
}

/**
 * One slot's picks with one pick's answer set. Returned whole, because that is
 * what `setPick` takes. `null` clears the answer back to unasked.
 */
export function withPickSignature(picks = [], key, value) {
  return picks.map((p) => {
    if (p.key !== key) return p
    if (value === null) {
      const { signature: _, ...rest } = p
      return rest
    }
    return { ...p, signature: Boolean(value) }
  })
}
