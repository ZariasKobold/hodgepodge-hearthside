/**
 * A finished aftermath, read back.
 *
 * The aftermath locks when it is submitted, deliberately — reopening one is how
 * a player ends up making edits that span several games, and the phase rail
 * going inert is what says so. But locking it also made it *unreadable*, and
 * those are not the same thing. A player asked, in as many words, for "a
 * read-only view, just in case you realize there is an issue" — and she was
 * right, because the alternative on offer was photographing the screen before
 * pressing the last button.
 *
 * ## Why this is not `describePhase`
 *
 * `lib/rewind.js` already turns a record into prose, and reusing it here was
 * the obvious move and the wrong one. That prose is written for an **undo
 * warning**: "Coffee — bought, 2 scrip back", "Dr. Mo on Broken Arm — healed,
 * 1 scrip back". Every clause is phrased around what reversing it would cost,
 * which is exactly right above an "are you sure?" button and reads as nonsense
 * in a history. The same facts want the past tense here.
 *
 * So: two renderings of one record, on purpose, the way `toIndexedModel` and
 * `toCard` are two normalisers on purpose (§4). Do not merge them.
 *
 * Pure, and imports only phase metadata (§6).
 */

import { AFTERMATH_PHASES } from './campaign.js'
// The one suit map, not a second one. The first cut of this file declared its
// own with plural keys (`tomes`) while every record ever written stores the
// singular (`tome`), so the suit silently vanished from every barter line —
// visible only because it was checked against a real record rather than a
// fixture that agreed with the mistake.
import { SUITS } from '../data/equipment.js'

/** A flip as it was typed in: "8 of Tomes", "Black Joker", "cheated". */
export function describeFlip({ value, suit, cheated } = {}) {
  if (value == null) return null
  const face = value === 'blackJoker' ? 'Black Joker'
    : value === 'redJoker' ? 'Red Joker'
      : String(value)
  const of = suit && SUITS[suit] ? ` of ${SUITS[suit]}` : ''
  return `${face}${of}${cheated ? ' (cheated)' : ''}`
}

/**
 * What happened in one phase, as lines a person reads.
 *
 * Returns `[]` for a phase with nothing in it. That is different from a phase
 * that was skipped, and the caller distinguishes them — an early withdrawal
 * forfeits phases it never played, and printing "nothing bought" against a
 * barter the rules never offered would be the app inventing a decision.
 */
export function summarisePhase(record, phaseId) {
  if (!record) return []
  switch (phaseId) {
    case 'draw_hand':
      return record.handSize ? [`Drew a hand of ${record.handSize}.`] : []

    case 'payday':
      return record.paid ? [`Collected ${record.scripEarned ?? 0} scrip.`] : []

    case 'barter': {
      const out = []
      const flip = describeFlip(record.barter || {})
      if (flip) out.push(`Barter flip: ${flip}.`)
      const bought = record.barter?.bought || []
      for (const b of bought) {
        out.push(`Bought ${b.name || b.equipmentId}${b.cc != null ? ` for ${b.cc} scrip` : ''}.`)
      }
      if (record.barter?.flipped && !bought.length) out.push('Bought nothing.')
      return out
    }

    case 'advance_leader': {
      const out = []
      for (const t of record.advance?.taken || []) {
        const flip = describeFlip({ value: t.flipValue, cheated: t.cheated })
        const table = t.tableName || t.tableId
        // The action an advancement went on is the half that was thrown away
        // until v0.22.2, and the half a player is most likely to be checking.
        const onto = t.appliesTo?.name ? ` on ${t.appliesTo.name}` : ''
        const from = table ? ` from ${table}` : ''
        out.push(`${t.name || 'An advancement'}${onto}${from}${flip ? ` — flipped ${flip}` : ''}.`)
      }
      const boxes = record.advance?.boxesApplied
      if (boxes) out.push(`Crossed ${boxes} experience box${boxes === 1 ? '' : 'es'}.`)
      if (record.advance?.applied && !out.length) out.push('Took no advancement.')
      return out
    }

    case 'back_alley_doctor': {
      const attempts = record.doctor?.attempts || []
      if (!attempts.length) return []
      return attempts.map((a) => {
        const flip = describeFlip({ value: a.flipValue, cheated: a.cheated })
        const healed = a.outcome?.heals ? 'healed' : 'no result'
        // The injury he handed back is the part worth naming: two of his seven
        // results heal and then hurt, and a ledger reading only "healed" over
        // an arsenal that also gained something is the bug v0.22.6 fixed.
        const gave = a.hurt?.name ? `, gained ${a.hurt.name}` : ''
        return `${a.injuryName || 'An injury'} — ${healed}${gave}${flip ? ` (${flip})` : ''}.`
      })
    }

    case 'determine_injuries': {
      const flips = record.injuries?.flips || []
      const out = flips.map((f) => {
        const who = f.subjectName || f.name || 'A model'
        const got = f.result?.attaches ? f.result.name : 'no injury'
        const flip = describeFlip({ value: f.flipValue, cheated: f.cheated })
        return `${who} — ${got}${flip ? ` (${flip})` : ''}.`
      })
      for (const name of record.annihilatedNames || []) {
        out.push(`${name} was annihilated.`)
      }
      if (record.done && !out.length) out.push('Nobody was hurt.')
      return out
    }

    default:
      return []
  }
}

/**
 * The whole record, phase by phase, ready to render.
 *
 * Every phase appears — including the empty ones. A history that silently omits
 * the phases nothing happened in cannot be read as "and the doctor was not
 * visited"; it reads as the app having forgotten, which is precisely the doubt
 * this view exists to remove.
 */
export function summariseAftermath(game) {
  const record = game?.aftermath
  if (!record) return []
  const skipped = new Set(record.skippedPhases || [])
  return AFTERMATH_PHASES.map((p) => ({
    id: p.id,
    n: p.n,
    name: p.name,
    skipped: skipped.has(p.id),
    lines: skipped.has(p.id) ? [] : summarisePhase(record, p.id),
  }))
}

/** A one-line result for the game itself: "Week 1 · lost 3–4 · +1 scrip". */
export function summariseGame(game) {
  if (!game) return null
  const result = game.result === 'win' ? 'won'
    : game.result === 'loss' ? 'lost'
      : game.result === 'draw' ? 'drew' : null
  return {
    week: game.week,
    opponent: game.opponent || null,
    strategy: game.strategy || null,
    result,
    vp: game.vpSelf != null && game.vpOpponent != null
      ? `${game.vpSelf}–${game.vpOpponent}`
      : null,
    scrip: game.aftermath?.scripEarned ?? 0,
    withdrew: Boolean(game.withdrew),
  }
}
