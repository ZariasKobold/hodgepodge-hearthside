/**
 * The aftermath, as arithmetic.
 *
 * Six phases in a fixed order, walked once per game. Everything here is a plain
 * function over data (CLAUDE.md §6) so the numbers can be argued about at a
 * table without a browser open — which matters more here than anywhere else in
 * the app, because this is where scrip, injuries and advancements are decided.
 *
 * ## Why one flow and not six screens
 *
 * The fate deck is **not** reshuffled between phases. A black joker spent on
 * barter cannot come back on injuries, and the aftermath hand drawn in phase 1
 * is the same hand cheating every flip after it. Six independent screens would
 * each imply a fresh deck, which is the one thing the book explicitly rules
 * out. So the whole aftermath is a single record on the game, advanced a phase
 * at a time, and `nextPhase` is the only way forward.
 *
 * ## Withdrawal is a different shape, not a smaller one
 *
 * A crew that withdrew on or before turn two gets no VP, no barter flip and no
 * hand, loses the scrip it earned, and skips the entire aftermath **except**
 * injuries. That is not "the same flow with lower numbers" — five of six phases
 * do not happen — so `phasesFor` marks them skipped rather than letting the UI
 * render phases that cannot be played.
 */

import {
  AFTERMATH_PHASES, aftermathHandSize, payday, experienceEarned,
  DOCTOR_FEE_PER_ATTEMPT, ANNIHILATION_THRESHOLD,
} from './campaign.js'
import { EXPERIENCE_BOXES, tablesForTier } from '../data/advancements.js'
import { barterOffer, thirstOffer } from '../data/equipment.js'
import { injuryResult, luckyMissResult, doctorResult } from '../data/injuries.js'

export { AFTERMATH_PHASES, ANNIHILATION_THRESHOLD, DOCTOR_FEE_PER_ATTEMPT }

/** The one phase an early withdrawal still has to play. */
const SURVIVES_WITHDRAWAL = new Set(['determine_injuries'])

/**
 * Did this crew leave early enough to forfeit the aftermath?
 *
 * On or before turn two. Turn three and later is an ordinary withdrawal: the
 * crew still scores, still barters and still advances.
 */
export function withdrewEarly(game) {
  return Boolean(game?.withdrew) && game?.withdrewOnTurn != null && game.withdrewOnTurn <= 2
}

/**
 * The six phases with a `skipped` flag each, in order.
 *
 * Skipping is described rather than silently dropped, because a player looking
 * at a forfeited aftermath needs to see *why* four phases are missing — the
 * alternative is a screen that looks broken.
 */
export function phasesFor(game) {
  const forfeit = withdrewEarly(game)
  return AFTERMATH_PHASES.map((p) => ({
    ...p,
    skipped: forfeit && !SURVIVES_WITHDRAWAL.has(p.id),
    reason: forfeit && !SURVIVES_WITHDRAWAL.has(p.id)
      ? 'withdrew on or before turn two'
      : null,
  }))
}

/** The blank aftermath record a freshly logged game starts with. */
export function createAftermath(patch = {}) {
  return {
    phase: 'draw_hand',
    done: false,
    /** Phase 1 — the hand is a count, not cards; the cards are on the table. */
    handSize: 0,
    /** Phase 2 — recorded rather than derived, so a house ruling sticks. */
    scripEarned: 0,
    /** Phase 3 — { value, suit, thirstValue } plus what was bought. */
    barter: { flipped: false, value: null, suit: null, thirstValue: null, bought: [] },
    /** Phase 4 — { earned, spent: [{ boxIndex, tableId, name, page }] }. */
    advance: { experienceEarned: 0, taken: [] },
    /** Phase 5 — one entry per scrip spent, healed or not. */
    doctor: { attempts: [] },
    /** Phase 6 — one entry per model killed during the game. */
    injuries: { flips: [] },
    ...patch,
  }
}

/* ── phase 1 — draw aftermath hand ──────────────────────────────── */

/**
 * Cards drawn: one for finishing without withdrawing, one per scheme scored,
 * capped at three schemes — so four is the ceiling.
 */
export function handFor(game) {
  return aftermathHandSize({
    withdrew: game.withdrew,
    withdrewOnTurn: game.withdrewOnTurn,
    schemesCompleted: game.schemesCompleted,
  })
}

/* ── phase 2 — payday ───────────────────────────────────────────── */

export function paydayFor(game) {
  return payday({
    vp: game.vpSelf,
    won: game.result === 'win',
    myRating: game.campaignRatingSelf ?? 0,
    opponentRating: game.campaignRatingOpponent ?? 0,
    withdrew: game.withdrew,
    withdrewOnTurn: game.withdrewOnTurn,
  })
}

/**
 * The payday broken into its parts, for a UI that has to show its working.
 *
 * Derived from the same inputs rather than from `payday`'s total, and the
 * parts are asserted to sum to it in the tests — a breakdown that can disagree
 * with the number beside it is worse than no breakdown.
 */
export function paydayBreakdown(game) {
  if (withdrewEarly(game)) {
    return { forfeited: true, parts: [], total: 0 }
  }
  const fromVp = Math.ceil((game.vpSelf || 0) / 3)
  const winBonus = game.result === 'win' ? 1 : 0
  const ratingBonus = Math.max(
    0,
    (game.campaignRatingOpponent ?? 0) - (game.campaignRatingSelf ?? 0)
  )
  const parts = [
    { label: `${game.vpSelf || 0} VP`, value: fromVp },
    { label: 'won the game', value: winBonus },
    { label: 'lower campaign rating', value: ratingBonus },
  ].filter((p) => p.value !== 0)
  return { forfeited: false, parts, total: fromVp + winBonus + ratingBonus }
}

/* ── phase 3 — barter ───────────────────────────────────────────── */

/**
 * What the vendor has, given one barter flip.
 *
 * The always-available stock is on the counter whatever was flipped, which is
 * the book being kind: a barter phase is never empty, so the phase is never a
 * screen that only says no.
 */
export function barterStock(value, suit, { scrip = 0 } = {}) {
  return barterOffer(value, suit).map((e) => ({ ...e, affordable: e.cc <= scrip }))
}

/**
 * A *flipped* red joker sends you to Those Who Thirst; a *cheated* one counts
 * as a thirteen instead. The distinction is the whole rule, so it is a
 * parameter rather than an inference.
 */
export function reachesThirst({ value, cheated }) {
  return value === 'redJoker' && !cheated
}

/**
 * The numbered Those Who Thirst items — everything the table can offer on a
 * flip. Omen's Mark is excluded on purpose: it arrives on a joker, is free and
 * mandatory, and the book says outright that it may sit beside another of
 * these, so holding it must not close the table.
 */
const THIRST_IDS = new Set([
  'book-of-the-dead', 'judgement', 'medusa', 'vicious-thorn',
  'edict', 'blight', 'insight', 'rigged-fate-deck',
])

/**
 * "A player may only flip on this table if there is not already a Those Who
 * Thirst equipment in their arsenal" — so what you already hold closes the
 * table rather than filtering it.
 */
export function thirstStock(value, { held = [] } = {}) {
  if (held.some((id) => THIRST_IDS.has(id))) return []
  return thirstOffer(value)
}

/* ── phase 4 — advance leader ───────────────────────────────────── */

/** The tier printed in the nth box, or null for a blank one. `n` is 0-based. */
export function tierOfBox(n) {
  return EXPERIENCE_BOXES[n] ?? null
}

export const TOTAL_EXPERIENCE_BOXES = EXPERIENCE_BOXES.length

/**
 * Experience this game earned the leader.
 *
 * `killedNonPeon` and `interactedNearEnemyDeployment` are the player's answer
 * about what happened on the table — the app cannot know them, and asking is
 * honest where guessing would be wrong.
 */
export function experienceFor(game, leader) {
  return experienceEarned({
    path: leader?.advancementPath,
    killedNonPeon: Boolean(game.killedNonPeon),
    interactedNearEnemyDeployment: Boolean(game.interactedNearEnemyDeployment),
    lost: game.result === 'loss',
  })
}

/**
 * Which boxes checking `gained` more would fill, and what each grants.
 *
 * Returns one entry per box crossed, in order, because the book requires them
 * resolved one at a time in the order reached — a leader who fills a tier-1 and
 * a tier-2 box in one aftermath chooses for the first before seeing the second.
 *
 * Stops at the end of the track: a full track earns no more experience at all,
 * so surplus points are dropped rather than banked.
 */
export function boxesCrossed(checked, gained) {
  const out = []
  for (let i = checked; i < Math.min(checked + gained, TOTAL_EXPERIENCE_BOXES); i += 1) {
    const tier = tierOfBox(i)
    out.push({
      boxIndex: i,
      tier,
      /** A blank box is experience that bought nothing — still worth showing. */
      grantsAdvancement: tier != null,
      tables: tier ? tablesForTier(tier) : [],
    })
  }
  return out
}

/** Experience beyond the end of the track is lost, not banked. */
export function experienceWasted(checked, gained) {
  return Math.max(0, checked + gained - TOTAL_EXPERIENCE_BOXES)
}

export function trackIsFull(checked) {
  return checked >= TOTAL_EXPERIENCE_BOXES
}

/* ── phase 5 — back-alley doctor ────────────────────────────────── */

/**
 * What one scrip bought.
 *
 * The fee is spent whatever happens — "the doctor keeps your scrip regardless
 * of the result" — so the cost is charged by the caller before the flip rather
 * than conditionally on healing.
 */
export function doctorOutcome(value) {
  const row = doctorResult(value)
  if (!row) return null
  return {
    ...row,
    /** Two results heal *and* injure; the caller has to do both. */
    net: row.heals && row.addsInjury ? 'traded' : row.heals ? 'healed' : row.addsInjury ? 'worse' : 'nothing',
  }
}

export function doctorAffordable(scrip) {
  return scrip >= DOCTOR_FEE_PER_ATTEMPT
}

/* ── phase 6 — determine injuries ───────────────────────────────── */

/**
 * One flip per model killed **during the game**, not per model in the crew.
 * Peons never flip: they may not gain injuries or be annihilated at all.
 */
export function modelsToFlipFor(game, arsenal) {
  const killed = new Set(game.killedModelIds || [])
  return (arsenal.models || []).filter((m) => killed.has(m.id) && !m.peon && !m.annihilated)
}

/**
 * Resolve one injury flip against the model it was made for.
 *
 * Returns the row plus whether it must be thrown back. A reflip is not a
 * failure state — several results are simply impossible for some models, and a
 * leader who flips Traitor has not defected, they have flipped again.
 */
export function resolveInjuryFlip(value, suit, model = {}, { cheated = false } = {}) {
  const row = injuryResult(value, suit)
  if (!row) return null

  const reflip = row.reflipIf ? modelMatches(row.reflipIf, model) : false

  // An injury the model already carries is no injury at all — "the model got
  // lucky and suffers no injury this game". Not a reflip: the flip stands.
  const duplicate = Boolean(
    row.injury && (model.injuryNames || []).includes(row.name)
  )

  return {
    ...row,
    reflip,
    duplicate,
    attaches: Boolean(row.injury) && !reflip && !duplicate,
    annihilates: Boolean(row.annihilates) && !reflip,
    /** Only a *flipped* red joker reaches Lucky Miss. */
    luckyMiss: row.luckyMiss === 'ifFlipped' && !cheated,
  }
}

function modelMatches(condition, model) {
  switch (condition) {
    case 'leaderOrTotem': return Boolean(model.isLeader || model.isTotem)
    case 'masterOrTotem': return Boolean(model.isLeader || model.isTotem)
    case 'noTriggers': return model.hasTriggers === false
    case 'noAttackActions': return model.hasAttackActions === false
    case 'insignificant': return Boolean(model.insignificant)
    case 'noSignatureSymbols': return model.hasSignatureSymbols === false
    default: return false
  }
}

export function resolveLuckyMiss(value, model = {}) {
  const row = luckyMissResult(value)
  if (!row) return null
  return { ...row, reflip: row.reflipIf ? modelMatches(row.reflipIf, model) : false }
}

/**
 * Annihilation is checked **at the end of phase 6**, never during it.
 *
 * That timing is a real rule, not a convenience: a model can pick up an injury
 * mid-game (the Mutagen Injector does exactly this) and reach three before the
 * aftermath, and it survives until this check. Counting as you go would kill it
 * a phase early and take its cost out of the arsenal total while the barter
 * phase was still open.
 */
export function annihilatedAfterInjuries(counts) {
  return Object.entries(counts)
    .filter(([, n]) => n >= ANNIHILATION_THRESHOLD)
    .map(([id]) => id)
}

/* ── the walk ───────────────────────────────────────────────────── */

/**
 * The next phase after this one, skipping what a withdrawal forfeited.
 *
 * Returns null at the end. Deliberately does not decide *whether* the current
 * phase is finished — that is the component's business, because "finished"
 * means something different in each phase and only one of them (injuries) has
 * a countable end.
 */
export function nextPhase(game, from) {
  const phases = phasesFor(game)
  const i = phases.findIndex((p) => p.id === from)
  if (i < 0) return null
  for (let j = i + 1; j < phases.length; j += 1) {
    if (!phases[j].skipped) return phases[j].id
  }
  return null
}

/** The first phase that can actually be played. */
export function firstPhase(game) {
  return phasesFor(game).find((p) => !p.skipped)?.id ?? null
}
