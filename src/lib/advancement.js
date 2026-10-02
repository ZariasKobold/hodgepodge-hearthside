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

/**
 * Actions this holder gained from the tier-2 Action table, as pick-alikes.
 *
 * `slot` comes off the book's stat line (`kind` in `data/advancements.js`), so
 * a gained Balanced Sword is an attack action and a gained Leap a tactical one.
 * Until v0.29.0 every gained action had `slot: null` and was offered to *both*
 * tier-1 tables, which is how an attack trigger could land on a tactical action
 * with nothing able to say it was wrong. It is still null for the joker's free
 * choice, which is whatever the player named, and for any row the app cannot
 * match back to the book — an unknown is offered, never hidden (§6).
 */
export function gainedActions(holder) {
  return (holder?.advancements || [])
    .filter((a) => a.tableId === 'action')
    .map((a) => {
      const row = rowFor(a)
      return {
        key: gainedActionKey(a),
        name: a.name,
        slot: row?.kind ?? null,
        gained: true,
        page: a.page ?? null,
        /** The printed Skl and resist, so a Skl boost can be judged against a
            gained action exactly as it is against a picked one. */
        base: row?.kind ? { stat: row.stat, resistedBy: row.resistedBy } : null,
      }
    })
}

/**
 * The row of the totem table this totem came from, or null.
 *
 * By flip value first, which is what the aftermath records, then by name for a
 * totem written before `tableValue` was kept.
 */
export function totemRow(totem) {
  if (!totem) return null
  const rows = findTable('totem')?.entries || []
  return rows.find((r) => totem.tableValue != null && r.value === totem.tableValue)
    || rows.find((r) => r.name === totem.name)
    || null
}

/**
 * A totem's starting actions and abilities, shaped like a leader's picks.
 *
 * A leader's picks are what the player chose at creation. A totem's are printed
 * on its row of the totem table (pp. 52–53), so they are **derived on every
 * read** and never written onto the totem. Copying them would leave two
 * answers to keep in step. The Mini-Master's one action is the player's
 * choice, and that choice is the only part that is stored (`chosenAction`).
 *
 * Each carries `base`, its printed Skl and resist, which stands in for the
 * register card a leader's pick would be judged against.
 */
export function totemPicks(totem) {
  const row = totemRow(totem)
  const out = { attack: [], tactical: [], ability: [] }
  if (!row) return out
  const actions = [...(row.actions || [])]
  const chosen = totem.chosenAction
  if (row.chooseAction && chosen?.name && (chosen.kind === 'attack' || chosen.kind === 'tactical')) {
    actions.push({ name: chosen.name, kind: chosen.kind, stat: null, resistedBy: null, chosen: true })
  }
  for (const a of actions) {
    out[a.kind].push({
      key: `totem::${a.kind}::${a.name}`,
      name: a.name,
      model: null,
      printed: true,
      chosen: Boolean(a.chosen),
      triggers: a.triggers || [],
      // Unknown for the Mini-Master's choice: it is a master's action, whose
      // card this app does not hold.
      base: a.chosen ? null : { stat: a.stat, resistedBy: a.resistedBy },
    })
  }
  for (const name of row.abilities || []) {
    out.ability.push({ key: `totem::ability::${name}`, name, model: null, printed: true, triggers: [] })
  }
  return out
}

/**
 * The actions an advancement can be placed on: a leader's picks, or a totem's
 * printed starting actions. Until v0.29.3 a totem had no picks at all, so every
 * advancement given to one fell through to a written-in name that nothing
 * could check.
 */
function picksOf(holder) {
  if (holder?.picks) return holder.picks
  return totemPicks(holder)
}

/** "an attack action", "a tactical action" — for sentences a player reads. */
function aKind(slot) {
  return slot === 'attack' ? 'an attack action' : slot === 'tactical' ? 'a tactical action' : 'an ability'
}

/**
 * Why this placed advancement cannot stand where it is, or null if it can.
 *
 * p. 31 names one rule a record can break: the Attack Modification table goes
 * on "one attack action", the Tactical table on "one tactical action". So:
 *
 * - **wrong kind** — the target is a picked action from the other slot, or a
 *   gained action whose printed stat line makes it the other kind;
 * - **gone** — the target is no longer on the leader at all, because the pick
 *   it was placed on has since been changed. The modifier is then attached to
 *   nothing, which is the same fault the v0.22.3 repair existed to fix.
 *
 * A written-in target and a gained action of unknown kind are **not** problems:
 * they name something the app cannot see, which is an answer, not a mistake.
 * Being wrong in the direction of flagging a healthy leader would put a false
 * alarm in front of every player, so only what the book and the record prove
 * is reported.
 */
export function placementProblem(holder, adv) {
  const table = findTable(adv?.tableId)
  if (!needsTarget(table) || !adv?.appliesTo?.name) return null
  const target = adv.appliesTo
  const want = table.targetSlot

  /**
   * A written-in target names something the app cannot list — usually a
   * totem's action, which comes off a card this app does not store. It is
   * taken on trust, with one exception the app *can* prove: the name of one of
   * this leader's own actions of the other kind. A Lucky Upstart has no
   * tactical slot at all, so a Tactical Modification there falls through to
   * the written field, and typing the attack action's name puts a tactical
   * trigger on an attack.
   */
  if (target.written || !target.key) {
    const norm = (s) => String(s || '').trim().toLowerCase()
    const other = ['attack', 'tactical'].find((s) => s !== want
      && (picksOf(holder)[s] || []).some((p) => norm(p.name) === norm(target.name))
      && !(picksOf(holder)[want] || []).some((p) => norm(p.name) === norm(target.name)))
    return other
      ? {
          kind: 'wrong-kind',
          why: `${target.name} is ${aKind(other)}, and ${table.name} can only go on ${aKind(want)} (p. 31)`,
        }
      : null
  }

  const inSlot = (slot) => (picksOf(holder)[slot] || []).some((p) => p.key === target.key)
  if (inSlot(want)) return null

  const gained = gainedActions(holder).find((g) => g.key === target.key)
  if (gained) {
    if (!gained.slot || gained.slot === want) return null
    return {
      kind: 'wrong-kind',
      why: `${target.name} is ${aKind(gained.slot)}, and ${table.name} can only go on ${aKind(want)} (p. 31)`,
    }
  }

  const other = ['attack', 'tactical', 'ability'].find((s) => s !== want && inSlot(s))
  if (other) {
    return {
      kind: 'wrong-kind',
      why: `${target.name} is ${aKind(other)}, and ${table.name} can only go on ${aKind(want)} (p. 31)`,
    }
  }
  return {
    kind: 'gone',
    why: `${target.name} is no longer one of this leader's actions, so this is attached to nothing`,
  }
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

  const picks = (picksOf(holder)[table.targetSlot] || []).map((p) => ({
    key: p.key,
    name: p.name,
    slot: table.targetSlot,
    model: p.model || null,
    gained: false,
    printed: Boolean(p.printed),
    base: p.base,
  }))

  // A gained action of the other kind is not a target at all — offering it
  // disabled would suggest some row of this table could go on it, and none
  // can. One of unknown kind stays, marked unknown.
  const gained = gainedActions(holder).filter((g) => !g.slot || g.slot === table.targetSlot)

  return [...picks, ...gained].map((target) => {
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
    // A gained action's printed stat line stands in for a register card.
    // So does a totem's, printed on its row of the totem table.
    const base = target.gained || target.printed ? target.base : actionFor(target)
    const { action, stat, statChanged } = advancedAction(base, advancementsOn(holder, target.key))
    return {
      ...target,
      ...verdict(entry, {
        // A boost's `statTo` is absolute, so a gained action with one on it has
        // a Skl the app knows even with no card behind it. A printed "-" is
        // no Skl at all, and must not become 0.
        stat: action && action.stat != null && action.stat !== '' ? Number(action.stat) : statChanged ? stat : null,
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
    return target.gained && !target.slot
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
    return !a.appliesTo?.name || rowIsGuessed(a) || Boolean(placementProblem(holder, a))
  })
}

/**
 * Advancements that are placed legally and can still be moved (v0.29.1).
 *
 * A legal placement is not necessarily the one the player meant. A player asked
 * to move Reposition from Intuition to Lost in the Hunt — both tactical, so
 * nothing was wrong as far as the book goes and the repair panel never offered
 * it. A finished aftermath is closed, so there was no way back in. These are
 * the rows that are not already on `advancementsToRepair`, so one advancement
 * is never offered twice.
 */
export function movableAdvancements(holder) {
  const repair = new Set(advancementsToRepair(holder))
  return (holder?.advancements || []).filter((a) =>
    needsTarget(findTable(a.tableId)) && Boolean(a.appliesTo?.name) && !repair.has(a))
}

/**
 * Why this advancement is on the repair list, in the player's words.
 *
 * Three different reasons land a row on one panel, and a player looking at it
 * deserves to know which: a leader who is told "check this" about an
 * advancement they placed correctly last week, with no reason given, will
 * reasonably assume the app is broken.
 */
export function repairReason(holder, adv) {
  const problem = placementProblem(holder, adv)
  if (problem) return problem.why
  if (!adv?.appliesTo?.name) return 'recorded before the app asked which action it went on'
  if (rowIsGuessed(adv)) return `“${adv.name}” is printed more than once on that table, and the recorded row was a guess`
  return null
}

/** The advancements this holder has attached to one action. */
export function advancementsOn(holder, key) {
  if (!key) return []
  // Before v0.29.3 a totem's actions could not be listed, so its advancements
  // were placed by a written-in name. Those still belong on the printed action
  // of that name.
  const printed = key.startsWith('totem::') ? key.split('::').slice(2).join('::') : null
  const norm = (n) => String(n || '').trim().toLowerCase()
  return (holder?.advancements || []).filter((a) => a.appliesTo?.key === key
    || (printed && !a.appliesTo?.key && a.appliesTo?.name && norm(a.appliesTo.name) === norm(printed)))
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
