/**
 * What a leader still owes the player's attention.
 *
 * The app has grown several one-time repairs — starting scrip that was
 * displayed for eighteen versions and never paid (v0.19.1), advancements
 * recorded before anything asked which action they modified (v0.22.2) — and
 * every one of them shipped as a panel on a screen. That is the mistake this
 * module exists to stop repeating. A repair nobody can find is not a repair:
 * the starting-scrip offer lives on the last step of the *creation* wizard, a
 * screen nobody returns to after building their leader, and six days after it
 * shipped not one arsenal on the database had been paid.
 *
 * So the finding moves to the player rather than waiting for the player to
 * walk into it. Everything here is derived on every read, never stored and
 * never dismissible — an item disappears because it was **fixed**, which is
 * the only signal worth trusting. A dismissed warning and a resolved one look
 * identical a week later, and only one of them is true.
 *
 * ## The aftermath record is the provenance
 *
 * `lib/rewind.js` already leans on the fact that every arsenal effect the
 * aftermath applies is named in the record it wrote — `bought` names the
 * equipment, `taken` the advancements, `boxesApplied` the experience. That is
 * what makes going backwards possible, and it makes this possible too: the
 * record says what should be true of the arsenal, so anything the record
 * claims and the arsenal lacks is drift, and drift is worth saying out loud.
 *
 * It is not hypothetical. A player finished one aftermath across two sittings
 * six days apart; the barter purchase and all three advancements reached the
 * *game record* and none of them reached the arsenal, so her leader's card was
 * missing an action she had earned and her sheet omitted equipment she had
 * paid for. Nothing in the app said a word, because nothing was looking.
 *
 * Every drift check is deliberately **one-sided**: it reports what the record
 * has and the arsenal lacks, never the reverse. An arsenal may legitimately
 * hold things no record mentions — a hand-built starting arsenal, anything
 * from before the record carried ids — and calling those "extra" would be the
 * app being confidently wrong about weeks it did not witness.
 */

import { owedStartingScrip, startingArsenalSpend } from './shape/arsenal.js'
import { advancementsToRepair } from './advancement.js'
import { aftermathDrift } from './repair.js'

/** English for a list of names, so the bar can say what it actually found. */
function nameList(names) {
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Everything outstanding on one arsenal, worst first.
 *
 * `where` names the screen that resolves the item, so the bar can offer a way
 * there rather than describing one. `null` means there is nowhere to send
 * anybody yet — which is a true and useful thing to say, and much better than
 * a button that goes somewhere unhelpful.
 */
export function outstandingFor({ arsenal, campaign } = {}) {
  if (!arsenal) return []
  const items = []
  // One source of truth for "what is missing", shared with the repair that
  // puts it back. Two implementations of that question would eventually answer
  // it differently, and the failure mode is a bar that reports a loss the
  // repair cannot find — or worse, the reverse.
  const drift = aftermathDrift(arsenal, campaign)
  const advDrift = drift.advancements.map((a) => a.entry)
  const eqpDrift = drift.equipment.map((e) => e.bought)
  const boxes = drift.boxes

  if (advDrift.length || eqpDrift.length || boxes) {
    // Joined with semicolons and each clause labelled, because the inner lists
    // already spend the word "and" — running them together produced "Skill
    // Boost, Cruel Lessons and Balanced Sword, Gatling Gun and 3 experience
    // boxes", which reads as one list of five unrelated things.
    const parts = []
    if (advDrift.length) {
      const names = nameList(advDrift.map((a) => a.name))
      parts.push(`the advancement${advDrift.length === 1 ? '' : 's'} ${names}`)
    }
    if (eqpDrift.length) {
      parts.push(`${nameList(eqpDrift.map((e) => e.name))} from the barter`)
    }
    if (boxes) parts.push(`${boxes} experience ${boxes === 1 ? 'box' : 'boxes'}`)
    items.push({
      id: 'aftermath-drift',
      kind: 'aftermath-drift',
      severity: 'high',
      count: advDrift.length + eqpDrift.length + boxes,
      title: 'An aftermath was recorded but never reached this leader',
      detail: `The game record says you earned ${parts.join('; ')}. `
        + 'None of it is on the arsenal, so the card, the sheet and the '
        + 'campaign rating are all short. Nothing is lost — the record still '
        + 'holds all of it, and it can be put back.',
      where: 'arsenal',
      // Deliberately empty: the detail above already names everything, and the
      // bar prints `names` as a second list underneath.
      names: [],
    })
  }

  /**
   * An arsenal nobody has started spending is not owed anything yet — it is
   * being built right now.
   *
   * `owedStartingScrip` alone says 3, because an empty arsenal has all 25
   * soulstones unspent and has never been reconciled. True, and useless: it
   * fires the moment somebody clicks "build a new leader", so the very first
   * thing a new player would see is the app telling them it owes them money
   * for a leader they have not made. Caught in the browser, where it was the
   * first thing on the screen. The grant is a fact about a *finished* starting
   * arsenal, and there is no such thing until something has been bought.
   */
  const owed = startingArsenalSpend(arsenal) > 0 ? owedStartingScrip(arsenal) : 0
  if (owed > 0) {
    items.push({
      id: 'starting-scrip',
      kind: 'starting-scrip',
      severity: 'medium',
      count: owed,
      title: `${owed} starting scrip you were never paid`,
      detail: 'Each starting soulstone you chose not to spend becomes one '
        + 'scrip, up to three (p. 15). The creation screen showed that number '
        + 'for a long time without ever paying it in.',
      where: 'creation',
      names: [],
    })
  }

  const toRepair = [
    ...advancementsToRepair(arsenal.leader),
    ...advancementsToRepair(arsenal.totem),
  ]
  if (toRepair.length) {
    items.push({
      id: 'unplaced-advancements',
      kind: 'unplaced-advancements',
      severity: 'medium',
      count: toRepair.length,
      title: toRepair.length === 1
        ? 'An advancement does not say which action it changed'
        : `${toRepair.length} advancements do not say which action they changed`,
      detail: 'A tier-1 advancement modifies one chosen action (p. 31), and '
        + 'until it names one, the record and the arsenal sheet cannot show '
        + 'what it did.',
      where: 'arsenal',
      names: toRepair.map((a) => a.name),
    })
  }

  return items
}

/**
 * Outstanding items across the whole shelf, grouped by arsenal.
 *
 * The open leader is only one of them. A player with two leaders would
 * otherwise have to *open* the second one to be told it is owed scrip, which
 * is the same "you had to already be looking" failure this module exists to
 * end — and the player it was written for has exactly two.
 */
export function outstandingAcross(entries = []) {
  const groups = []
  for (const e of entries) {
    const items = outstandingFor(e)
    if (items.length) groups.push({ arsenal: e.arsenal, items })
  }
  return groups
}
