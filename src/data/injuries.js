/**
 * The three flip tables of the back half of the aftermath — Index of the
 * Untold, pp. 33–36.
 *
 * Names, flip values and page numbers only; the effect of an injury is book
 * content and stays in the book (CLAUDE.md §4). What is modelled here instead
 * is the *behaviour* the app has to act on — whether a result attaches an
 * injury at all, whether it annihilates, and when it has to be reflipped —
 * because those decide numbers the app is responsible for: the campaign rating
 * subtracts injuries, and three injuries annihilate a model.
 *
 * Every reflip rule is a flag rather than prose, because each one is a real
 * branch the flow has to walk rather than a note for the player. A model with
 * no triggers that flips Permanent Hex has not been injured, and a rating
 * computed as though it had would be wrong.
 */

/** Flip results that are not a card value. */
export const BLACK_JOKER = 'blackJoker'
export const RED_JOKER = 'redJoker'

const RM = ['ram', 'mask']
const CT = ['crow', 'tome']

/**
 * The injury table, p. 34–35.
 *
 *   `injury`   — does this attach an injury upgrade? Several results do not.
 *   `annihilates` — the model is removed from the arsenal outright.
 *   `reflipIf`  — a condition under which the result is discarded and reflipped.
 *   `luckyMiss` — send the player on to the Lucky Miss table.
 */
export const INJURY_TABLE = [
  {
    value: BLACK_JOKER, suits: null, name: 'Traitor', page: 34,
    injury: false, annihilates: true, reflipIf: 'leaderOrTotem',
    /** The model joins the other crew's arsenal, injuries and equipment intact. */
    defects: true,
  },

  { value: 1, suits: RM, name: 'Just a Flesh Wound', page: 34, injury: false },
  { value: 2, suits: RM, name: 'Just a Flesh Wound', page: 34, injury: false },
  { value: 3, suits: RM, name: 'Severe Amputation', page: 34, injury: true },
  { value: 4, suits: RM, name: 'Pack Mule', page: 34, injury: true },
  { value: 5, suits: RM, name: 'Headstrong', page: 34, injury: true, reflipIf: 'masterOrTotem' },
  { value: 6, suits: RM, name: 'Permanent Hex', page: 34, injury: true, reflipIf: 'noTriggers' },
  { value: 7, suits: RM, name: 'Senseless', page: 34, injury: true },
  { value: 8, suits: RM, name: 'Mangled Limb', page: 34, injury: true, reflipIf: 'noAttackActions' },
  { value: 9, suits: RM, name: 'Leadfooted', page: 35, injury: true },
  { value: 10, suits: RM, name: 'Defenseless', page: 35, injury: true },
  { value: 11, suits: RM, name: 'Loose Lips', page: 35, injury: true },
  { value: 12, suits: RM, name: 'Blood Debt', page: 35, injury: true },
  { value: 13, suits: RM, name: 'Killed Off', page: 35, injury: false, annihilates: true },

  { value: 1, suits: CT, name: 'Just a Flesh Wound', page: 35, injury: false },
  { value: 2, suits: CT, name: 'Just a Flesh Wound', page: 35, injury: false },
  { value: 3, suits: CT, name: 'Distracted by Voices', page: 35, injury: true },
  { value: 4, suits: CT, name: 'Always Wandering', page: 35, injury: true },
  { value: 5, suits: CT, name: 'Fugitive', page: 35, injury: true },
  { value: 6, suits: CT, name: 'One Last Job', page: 35, injury: true, reflipIf: 'insignificant' },
  { value: 7, suits: CT, name: 'Off Balance', page: 35, injury: true },
  { value: 8, suits: CT, name: 'Barely Holding Together', page: 35, injury: true },
  { value: 9, suits: CT, name: 'Dulled Edge', page: 35, injury: true },
  { value: 10, suits: CT, name: 'Missing Fingers', page: 35, injury: true, reflipIf: 'noSignatureSymbols' },
  { value: 11, suits: CT, name: 'Brittle Bones', page: 35, injury: true },
  { value: 12, suits: CT, name: 'Black Mailed', page: 35, injury: true },
  { value: 13, suits: CT, name: 'Killed Off', page: 35, injury: false, annihilates: true },

  {
    value: RED_JOKER, suits: null, name: 'Close Call', page: 35,
    injury: false,
    /** Only a *flipped* red joker reaches Lucky Miss; a cheated one is just a miss. */
    luckyMiss: 'ifFlipped',
  },
]

/** Human-readable reasons a result has to be thrown back. */
export const REFLIP_REASONS = {
  leaderOrTotem: 'this model is a leader or totem',
  masterOrTotem: 'this model is a master or totem',
  noTriggers: 'this model has no triggers',
  noAttackActions: 'this model has no attack actions',
  insignificant: 'this model has the Insignificant ability',
  noSignatureSymbols: 'this model has no signature symbols',
}

/**
 * Lucky Miss, p. 36. Every result here is good and none of them touch the
 * campaign rating — which is why they are kept apart from injuries rather than
 * stored as an injury with a positive effect.
 */
export const LUCKY_MISS = [
  { value: 1, name: 'Martyr', page: 36 },
  { value: 2, name: 'In the Name of Research', page: 36 },
  { value: 3, name: 'Lowered Expectations', page: 36, reflipIf: 'masterOrTotem' },
  { value: 4, name: 'Discreet Operative', page: 36 },
  { value: 5, name: 'Secret Directive', page: 36 },
  { value: 6, name: 'Hydraulic Limb', page: 36 },
  { value: 7, name: 'Tyrant’s Hunger', page: 36 },
  { value: 8, name: 'Bestial Rage', page: 36 },
  { value: 9, name: 'Slow to Die', page: 36 },
  { value: 10, name: 'Slippery', page: 36 },
  { value: 11, name: 'Fast Runner', page: 36 },
  { value: 12, name: 'The Hunter', page: 36 },
  { value: 13, name: 'The Scholar', page: 36 },
  {
    value: 'joker', name: 'Doppelganger', page: 36,
    /** No upgrade — a copy of the model joins the arsenal. */
    copiesModel: true,
  },
]

/**
 * Back-Alley Doctor, p. 33. One scrip per attempt and the doctor keeps it
 * either way, which is why `cost` lives on the phase rather than on a result.
 *
 * Ranges rather than single values, because 1–8 and 12–13 share an outcome.
 */
export const BACK_ALLEY_DOCTOR = [
  {
    from: BLACK_JOKER, to: BLACK_JOKER, name: '“Oops?”', page: 33,
    heals: false,
    /** A second injury, drawn from the injury chart, jokers reflipped. */
    addsInjury: true,
  },
  { from: 1, to: 8, name: '“Thanks for the scrip!”', page: 33, heals: false },
  {
    from: 9, to: 9, name: '“How many fingers do you need?”', page: 33,
    heals: true, addsInjury: true,
  },
  {
    from: 10, to: 10, name: '“That still counts as healed.”', page: 33,
    heals: true, grantsCharacteristic: 'Undead',
  },
  {
    from: 11, to: 11, name: '“Took some spare parts but we got there.”', page: 33,
    heals: true, grantsCharacteristic: 'Construct',
  },
  { from: 12, to: 13, name: '“Success!”', page: 33, heals: true },
  {
    from: RED_JOKER, to: RED_JOKER, name: '“Gonna need you to write me a review.”', page: 33,
    heals: true, luckyMiss: 'ifFlipped',
  },
]

/** One scrip per attempt, kept whatever the result. */
export const DOCTOR_FEE = 1

/**
 * The injury row a flip lands on.
 *
 * Jokers carry no suit; numbered results need one, and a value without a suit
 * has no answer rather than a wrong one — the caller asks for the suit before
 * this is reachable.
 */
export function injuryResult(value, suit) {
  if (value === BLACK_JOKER || value === RED_JOKER) {
    return INJURY_TABLE.find((r) => r.value === value) || null
  }
  if (!suit) return null
  return INJURY_TABLE.find((r) => r.value === value && r.suits?.includes(suit)) || null
}

export function luckyMissResult(value) {
  if (value === BLACK_JOKER || value === RED_JOKER) {
    return LUCKY_MISS.find((r) => r.value === 'joker') || null
  }
  return LUCKY_MISS.find((r) => r.value === value) || null
}

export function doctorResult(value) {
  return BACK_ALLEY_DOCTOR.find((r) => {
    if (r.from === value) return true
    if (typeof r.from !== 'number' || typeof value !== 'number') return false
    return value >= r.from && value <= r.to
  }) || null
}
