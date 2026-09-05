/**
 * Advancements that attach to a particular action, and what they do to it.
 *
 * The tier-1 tables are not a list of things a leader gains — they are a list
 * of things *one action* gains. p. 31, twice, once for each table:
 *
 *   "Once you have chosen an option, choose one attack action on your leader on
 *    which to apply this modifier. This modifier only applies to the selected
 *    action."
 *
 * Until v0.22.2 the app recorded the modifier and threw the target away, so a
 * leader's record said "Skill Boost" and "Draw Out Secrets" somewhere off to
 * one side while the action they belonged to printed its unmodified stat line.
 * That is the advancement's whole content missing: a trigger nobody can say
 * which action it fires on is not a trigger.
 *
 * ## The three kinds, and why the numbers are kept
 *
 * p. 31 again: "There are three types of modifiers on this table: triggers,
 * Skl modifiers, and signature modifiers. Triggers ... will add the listed
 * trigger to the selected action. Skl modifiers adjust the action's Skl. And
 * signature modifiers make the action into a f action."
 *
 * So a Skl modifier is a number — "change its Skl to 6" — and it is kept in
 * `data/advancements.js` for the same reason the totem stat lines are (§4): a
 * Skl is a fact of the same kind as a Df, not rules text. Keeping it is what
 * lets the record print Stat 6 instead of printing Stat 5 beside a note saying
 * it is really 6.
 *
 * `statTo` is absolute, not a delta, which matters more than it looks: the
 * final Skl is known from the advancement alone, so the sheet fills that column
 * even with the register unreachable. Everything here degrades (§6).
 *
 * Imports nothing — not React, not `rules.js`. The caller resolves picks to
 * register actions and passes a lookup in, which is why this is testable with
 * a plain object and why a register outage is the caller's problem rather than
 * a branch in here.
 */

import { findTable } from '../data/advancements.js'

/**
 * The one advancement type that needs naming here.
 *
 * `Skl` and `Signature` rows are recognised by the fields they carry
 * (`statTo`, `signature`) rather than by their label, so a row that grew a
 * second effect would still be applied. A trigger is the row with no fields at
 * all, which is why it is the one identified by its type.
 */
export const TRIGGER = 'Trigger'

/** Resists a Skl modifier is allowed to touch (p. 39–40, attack tables). */
const RESISTS = ['Df', 'Wp']

/**
 * Suit names for an advancement trigger.
 *
 * Separate from `equipment.js`'s `SUITS`, which is a barter table's plural
 * headings and has no soulstone. A trigger is written in the singular and the
 * tier-1 tables print soulstone triggers, so a shared map would be wrong in
 * both directions.
 */
export const SUIT_LABEL = {
  ram: 'Ram', mask: 'Mask', crow: 'Crow', tome: 'Tome', soulstone: 'Soulstone',
}

/**
 * A trigger row, as opposed to a Skl or signature modifier.
 *
 * An advancement whose row cannot be resolved counts as a trigger: triggers are
 * far and away the most plentiful type on both tier-1 tables, and reading an
 * unknown row as a trigger adds a line to the card, while reading it as a Skl
 * modifier would change a number. Guess in the direction that cannot lie about
 * a stat.
 */
export function isTriggerRow(adv) {
  const row = rowFor(adv)
  return !row || row.type === TRIGGER
}

/**
 * Does an advancement from this table attach to an action already on the card?
 *
 * Only the two tier-1 tables. Tier 2 grants a *new* action or ability, tier 3 a
 * totem or a summoning effect, tier 4 a crew-card line — none of those modify
 * something the leader already has, so none of them has a target to ask for.
 */
export function needsTarget(table) {
  return Boolean(table?.targetSlot)
}

/**
 * The key an action gained from the tier-2 table is addressed by.
 *
 * Deliberately not the action's name: two advancements could grant the same
 * action to a leader and a totem, and a name is not an identity. Falls back to
 * the name only for entries recorded before advancements carried ids.
 */
export function gainedActionKey(entry) {
  return `adv::${entry?.id || entry?.name || ''}`
}

/** Actions this holder gained from the tier-2 Action table, as pick-alikes. */
export function gainedActions(holder) {
  return (holder?.advancements || [])
    .filter((a) => a.tableId === 'action')
    .map((a) => ({
      key: gainedActionKey(a),
      name: a.name,
      /** No slot: the book's tier-2 table does not say which of these are
          attack actions and which are tactical, and this app does not guess. */
      slot: null,
      gained: true,
      page: a.page ?? null,
    }))
}

/**
 * Every action an advancement from `table` may be applied to, with a verdict.
 *
 * `eligible` is deliberately three-valued. `true` and `false` are answers;
 * `null` means "the app cannot tell" — a hand-entered pick, an action gained by
 * advancement, or the register being unreachable — and an unknown must never be
 * hidden. Refusing to offer an action because a donation-funded API is down
 * would be the app losing the player's advancement for them.
 *
 * @param holder     the leader or the totem
 * @param table      the advancement table chosen
 * @param entry      the row chosen off it, or null before one is
 * @param actionFor  (pick) => register action, or null if unresolved
 */
export function targetsFor(holder, table, entry, actionFor = () => null) {
  if (!needsTarget(table)) return []

  const picks = (holder?.picks?.[table.targetSlot] || []).map((p) => ({
    key: p.key,
    name: p.name,
    slot: table.targetSlot,
    model: p.model || null,
    gained: false,
  }))

  return [...picks, ...gainedActions(holder)].map((target) => {
    /**
     * The action **as this leader's earlier advancements left it**, not as the
     * register prints it.
     *
     * A leader who takes the Skl 4→5 boost and then the 5→6 boost has an
     * action the register still calls Skl 4, and judging the second against
     * that would refuse a perfectly legal advancement. Two boosts in one
     * evening is uncommon; two across a twelve-week campaign is the ordinary
     * case, which is exactly what the repair path on the arsenal view walks
     * through.
     */
    const base = target.gained ? null : actionFor(target)
    const { action, stat, statChanged } = advancedAction(base, advancementsOn(holder, target.key))
    return {
      ...target,
      ...verdict(entry, {
        // A boost's `statTo` is absolute, so a gained action with one on it has
        // a Skl the app knows even with no card behind it.
        stat: action ? Number(action.stat) : statChanged ? stat : null,
        resistedBy: action?.resistedBy ?? null,
        hasCard: Boolean(action),
      }, target),
    }
  })
}

function verdict(entry, state, target) {
  if (!entry) return { eligible: null, why: '' }

  // A trigger or a signature modifier goes on any action of the right kind, so
  // the only question left is whether the app knows what kind this is.
  if (!entry.statFrom) {
    return target.gained
      ? { eligible: null, why: 'gained by advancement — check it is the right kind of action' }
      : { eligible: true, why: '' }
  }

  if (state.stat == null || Number.isNaN(state.stat)) {
    return {
      eligible: null,
      why: target.gained
        ? 'gained by advancement — the app cannot read its Skl'
        : 'not read from the register — check the Skl yourself',
    }
  }

  if (!entry.statFrom.includes(state.stat)) {
    return { eligible: false, why: `Skl ${state.stat}, needs ${entry.statFrom.join(' or ')}` }
  }

  // The resist is only ever on the card. A known Skl is not enough to clear a
  // row that names one, so this stays an unknown rather than becoming a yes.
  if (entry.needsResist) {
    if (!state.hasCard) {
      return { eligible: null, why: 'the app cannot read what this action resists' }
    }
    if (!RESISTS.includes(state.resistedBy)) {
      return { eligible: false, why: `resists ${state.resistedBy || 'nothing'}, needs Df or Wp` }
    }
  }
  return { eligible: true, why: '' }
}

/** Every row on this advancement's table that carries its name. */
export function rowsNamed(adv) {
  const table = findTable(adv?.tableId)
  if (!table) return []
  return table.entries.filter((e) => e.name === adv.name)
}

/**
 * A row this advancement might be, where the recorded one cannot be trusted.
 *
 * "Skill Boost" is printed three times on the attack table and twice on the
 * tactical one, and until v0.22.2 the option select was keyed by **name** — so
 * it handed back whichever came first, and a leader who flipped a 10 and took
 * the Skl 5→6 boost was recorded as having taken the 4→5. The recorded row is
 * therefore a guess for any repeated name, and the repair has to offer the
 * alternatives rather than hold the player to the wrong one.
 *
 * Empty for every name printed once, which is all of them but that one.
 */
export function ambiguousRows(adv) {
  const named = rowsNamed(adv)
  return named.length > 1 ? named : []
}

/**
 * An advancement whose recorded row is a guess the app made, not an answer.
 *
 * Two conditions, and both are needed. The name has to be one printed more than
 * once — only "Skill Boost" is — and the record has to predate v0.22.2, which
 * is exactly what a missing `id` means: `uid('adv')` arrived in the same change
 * that fixed the name-keyed select. An advancement taken since then was chosen
 * by index off the offer, so its row is what the player picked.
 *
 * Confirming one mints it an id, which is what takes it off this list. That is
 * the honest meaning of the id here — not "new", but "a person has said this
 * row is right".
 */
export function rowIsGuessed(adv) {
  return !adv?.id && ambiguousRows(adv).length > 1
}

/**
 * Everything the repair panel has to offer, placed or not.
 *
 * Widened after a player corrected a Skill Boost's action on the first pass and
 * then found the sheet still reading Skl 5. Placing it took it off the list
 * while its *row* was still the wrong one of three, and there was no way back
 * in — which is the same dead end this panel was built to remove, one step
 * further along. **A repair screen that can only be visited once is a trap.**
 *
 * A target written in by hand counts as placed: it names an action this app
 * cannot list, which is an answer, not a gap.
 */
export function advancementsToRepair(holder) {
  return (holder?.advancements || []).filter((a) => {
    if (!needsTarget(findTable(a.tableId))) return false
    return !a.appliesTo?.name || rowIsGuessed(a)
  })
}

/** The advancements this holder has attached to one action. */
export function advancementsOn(holder, key) {
  if (!key) return []
  return (holder?.advancements || []).filter((a) => a.appliesTo?.key === key)
}

/**
 * A register action as the leader's advancements leave it.
 *
 * Returns the action with its Skl and signature flag brought up to date, plus
 * the triggers the advancements added — kept separate from the action's own
 * `triggers`, because those belong to the source model and the leader never got
 * them (§4, and `RulesText.jsx`'s `showTriggers`). An advancement trigger is
 * one the leader genuinely has.
 *
 * `action` may be null. The triggers and the final Skl still come back, because
 * both are known from the advancement alone.
 */
export function advancedAction(action, advancements = []) {
  let stat = action?.stat ?? null
  let statChanged = false
  let signature = Boolean(action?.isSignature)
  let madeSignature = false
  const triggers = []

  for (const adv of advancements) {
    const row = rowFor(adv)
    if (row?.statTo != null) {
      stat = row.statTo
      statChanged = true
    }
    if (row?.signature) {
      signature = true
      madeSignature = true
    }
    if (!row || row.type === TRIGGER) {
      triggers.push({ name: adv.name, suit: row?.suit ?? null, page: adv.page ?? row?.page ?? null })
    }
  }

  // Only what actually moved is written back. Stamping `isSignature: false`
  // onto every action would put a key on the register's record that the
  // register never sent, and this app is a reader of that record, not an author.
  const advanced = action
    ? { ...action, ...(statChanged ? { stat } : {}), ...(madeSignature ? { isSignature: signature } : {}) }
    : null

  return { action: advanced, stat, statChanged, madeSignature, triggers }
}

/**
 * The table row an advancement was taken from.
 *
 * Looked up rather than stored: `taken` records the name and the table, and the
 * mechanical half — `statTo`, `signature`, the suit — is book data that must
 * stay in one place. A copy on the saved document would go stale the day an
 * erratum moved a row, and would be a second transcription to keep honest.
 *
 * **A name is not a row.** "Skill Boost" is printed three times on the attack
 * table, at 7, 10 and 12, and the three change the Skl to three different
 * numbers. So the row's own flip value (`tableValue`, recorded when it was
 * taken) is half the key. Where it is missing — an advancement recorded before
 * v0.22.2 — an unambiguous name still resolves and an ambiguous one resolves to
 * nothing, because guessing which Skill Boost this was would print a stat the
 * leader does not have.
 */
export function rowFor(adv) {
  const named = rowsNamed(adv)
  if (named.length === 0) return null
  if (adv.tableValue != null) {
    return named.find((e) => e.value === adv.tableValue) || null
  }
  return named.length === 1 ? named[0] : null
}
