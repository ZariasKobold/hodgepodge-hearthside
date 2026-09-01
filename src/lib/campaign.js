/**
 * Campaign arithmetic. Every value here is derived, never stored — storing a
 * campaign rating would go stale the moment an injury lands.
 */

export const STARTING_SOULSTONES = 25
export const MAX_STARTING_SCRIP = 3
export const FIRST_HIRE_DISCOUNT = 5
export const OUT_OF_KEYWORD_SURCHARGE = 1

/** Unspent starting soulstones become scrip, capped. */
export function startingScrip(soulstonesSpent) {
  const unspent = STARTING_SOULSTONES - soulstonesSpent
  return Math.min(Math.max(unspent, 0), MAX_STARTING_SCRIP)
}

/**
 * Scrip cost of adding a model during a weekly hire.
 *
 * The book leaves a real gap here: the first hire each week costs 5 less, and
 * a cheap enough model drives that below zero. It never says what happens.
 * Since the weekly hire is mandatory, this comes up constantly rather than
 * rarely, and resolving negatives as a refund would be an infinite scrip
 * engine — add your cheapest model first every week and pocket the change.
 *
 * Defaults: floor at zero, surcharge applied before the discount. Both are
 * exposed as house rules so a group that reads it differently is not fighting
 * the app, and so the choice is recorded rather than re-argued every week.
 */
export function hireCost(model, { isFirstOfWeek, outOfKeyword, isVersatile }, houseRules = {}) {
  const { allowNegative = false, surchargeBeforeDiscount = true } = houseRules

  const surcharge = outOfKeyword && !isVersatile ? OUT_OF_KEYWORD_SURCHARGE : 0
  const discount = isFirstOfWeek ? FIRST_HIRE_DISCOUNT : 0

  let cost
  if (surchargeBeforeDiscount) {
    cost = model.cost + surcharge - discount
  } else {
    cost = Math.max(model.cost - discount, 0) + surcharge
  }

  return allowNegative ? cost : Math.max(cost, 0)
}

/**
 * Campaign rating for one game. Counts equipment selected *at hiring*, so this
 * belongs to the game record, not to the arsenal.
 */
export function campaignRating({ equipmentHired = 0, leaderAdvancements = 0, totemAdvancements = 0, injuriesInCrew = 0 }) {
  return equipmentHired + leaderAdvancements + totemAdvancements - injuriesInCrew
}

/** The lower-rated crew gets the difference in stones, up to three. */
export function soulstoneBonus(myRating, theirRating) {
  if (myRating >= theirRating) return 0
  return Math.min(theirRating - myRating, 3)
}

/** Encounter size is capped by the smaller of the two arsenals, plus six. */
export function maxEncounterSize(myArsenalTotal, theirArsenalTotal) {
  return Math.min(myArsenalTotal, theirArsenalTotal) + 6
}

export function arsenalTotal(models) {
  return models.reduce((sum, m) => sum + (m.cost || 0), 0)
}

/**
 * Aftermath hand: one card for finishing without withdrawing, one per scheme
 * scored (max three), so four is the ceiling.
 *
 * Withdrawing on or before turn two is different in kind, not degree — that
 * crew gets no VP, no barter flip and no hand at all, and skips the whole
 * aftermath except flipping for injuries.
 */
export function aftermathHandSize({ withdrew, withdrewOnTurn = null, schemesCompleted = 0 }) {
  if (withdrew && withdrewOnTurn != null && withdrewOnTurn <= 2) return 0
  return (withdrew ? 0 : 1) + Math.min(schemesCompleted, 3)
}

/**
 * Phase 2, Payday. Scrip earned after a game.
 *
 * One scrip per three VP rounded up, one more for winning, plus the campaign
 * rating difference if you were the lower-rated crew.
 *
 * Note the asymmetry with `soulstoneBonus`: the soulstone version caps at +3,
 * this one does not. That reads like an oversight but it's what the book says,
 * so it's what we do. If a group wants it capped, that's a house rule.
 *
 * A crew that withdrew on or before turn two loses scrip earned this game.
 */
export function payday({ vp = 0, won = false, myRating = 0, opponentRating = 0, withdrew = false, withdrewOnTurn = null }) {
  if (withdrew && withdrewOnTurn != null && withdrewOnTurn <= 2) return 0
  const fromVp = Math.ceil(vp / 3)
  const winBonus = won ? 1 : 0
  const ratingBonus = Math.max(0, opponentRating - myRating) // deliberately uncapped
  return fromVp + winBonus + ratingBonus
}

/**
 * Phase 6. One flip per model killed during the game — not per model in the
 * crew. A crew that withdrew early still flips for injuries; it's the one
 * part of the aftermath they don't skip.
 */
export function injuryFlipCount(killedModelIds = []) {
  return killedModelIds.length
}

/** Three or more injuries annihilates a model, checked at the END of phase 6. */
export const ANNIHILATION_THRESHOLD = 3

export function isAnnihilated(injuryCount) {
  return injuryCount >= ANNIHILATION_THRESHOLD
}

/**
 * The six aftermath phases, in order.
 *
 * Order is load-bearing: the fate deck is NOT reshuffled between phases, so a
 * black joker spent on barter can't reappear on injuries. The UI has to walk
 * this sequence as one stateful flow rather than six independent screens, and
 * each flip must resolve — cheat or don't — before the next is made.
 */
export const AFTERMATH_PHASES = [
  { n: 1, id: 'draw_hand', name: 'Draw Aftermath Hand' },
  { n: 2, id: 'payday', name: 'Payday' },
  { n: 3, id: 'barter', name: 'Barter' },
  { n: 4, id: 'advance_leader', name: 'Advance Leader' },
  { n: 5, id: 'back_alley_doctor', name: 'Back-Alley Doctor' },
  { n: 6, id: 'determine_injuries', name: 'Determine Injuries' },
]

/** Phase 5 costs 1 scrip per attempt, and the doctor keeps it either way. */
export const DOCTOR_FEE_PER_ATTEMPT = 1

/**
 * Experience from one game — Index of the Untold, p. 31.
 *
 * The comment here used to say the reachable maximum was **two**, and that the
 * book's stated maximum of three described a rule that was not implemented and
 * might not exist (audit L1). The rule exists: the first point is for *playing
 * the game*, "every encounter teaches something", and it was simply missing.
 *
 * With it back, the three are participation, the advancement-path bonus, and
 * the consolation for losing — which is exactly the maximum the book claims,
 * and exactly the three the book's own worked example on p. 37 awards Jack.
 *
 * Nothing here caps the total, because nothing needs to: three ways to earn
 * one point each cannot exceed three.
 */
export function experienceEarned({ path, killedNonPeon, interactedNearEnemyDeployment, lost }) {
  let xp = 1                                   // for playing at all
  if (path === 'bruiser' && killedNonPeon) xp += 1
  if (path === 'strategist' && interactedNearEnemyDeployment) xp += 1
  if (lost) xp += 1
  return xp
}

/** The most one game can teach, so a UI can say "2 of 3" without arithmetic. */
export const MAX_EXPERIENCE_PER_GAME = 3
