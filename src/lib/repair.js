/**
 * Putting back what a lost update ate.
 *
 * On 2026-09-08 a reconcile in flight overwrote an arsenal with its own opening
 * snapshot (see `settleAfterPush` in `reconcile.js`). The bug is fixed; the
 * damage is not. One arsenal on the database is still missing a Gatling Gun,
 * three advancements and three experience boxes that its aftermath record says
 * were earned.
 *
 * ## Per row id, never a forward replay
 *
 * The tempting repair is to walk the record forward and re-apply it. That
 * double-applies everything that *did* land — and in the real case the payday
 * landed and nothing after it did, so a replay would pay the scrip twice. The
 * record is a true account of the evening, not a queue of pending work.
 *
 * So this computes a **delta**: what the record names, minus what the arsenal
 * already holds, matched on the ids the record has carried since v0.22.0
 * (`rowId` for a purchase) and v0.22.2 (`id` for an advancement). Applying it
 * twice is a no-op, because the second pass finds nothing missing — the same
 * property `startingScripPatch` has, and for the same reason: reconciled, not
 * appended.
 *
 * ## What it will not touch
 *
 * Anything the record cannot identify. An entry with no id is skipped rather
 * than matched by name, because a leader holding one "Skill Boost" would
 * otherwise look like they were missing the second one they also took. Skipping
 * means an older loss goes unrepaired, which is a great deal better than
 * inventing an advancement nobody earned.
 *
 * Pure (§6). The component confirms; this only ever describes and computes.
 */

import { createEquipment } from './shape/arsenal.js'
import { findEquipment, isThirst } from '../data/equipment.js'

/** The games belonging to this arsenal that carry an aftermath record. */
function gamesFor(arsenal, campaign) {
  return (campaign?.games || []).filter((g) => g.arsenalId === arsenal?.id && g.aftermath)
}

/** Every advancement id the arsenal holds, wherever it is filed. */
function heldAdvancementIds(arsenal) {
  const held = new Set()
  for (const a of arsenal?.leader?.advancements || []) if (a.id) held.add(a.id)
  for (const a of arsenal?.totem?.advancements || []) if (a.id) held.add(a.id)
  for (const a of arsenal?.crewCardAdvancements || []) if (a.id) held.add(a.id)
  return held
}

/**
 * Where an advancement belongs, matching `Aftermath.jsx`'s own routing.
 *
 * A tier-3 totem is not an advancement on anybody — it is the crew gaining a
 * totem — so it has no home here and is never looked for.
 */
function destinationFor(entry, arsenal) {
  if (entry.tableId === 'totem') return null
  if (entry.tableId === 'crew-card') return 'crewCard'
  if (entry.to === 'totem') return arsenal?.totem ? 'totem' : null
  return 'leader'
}

/**
 * What the record claims and the arsenal lacks.
 *
 * One-sided by construction, and that is the whole discipline: it reports what
 * the record has and the arsenal does not, never the reverse. An arsenal
 * legitimately holds things no record mentions.
 */
export function aftermathDrift(arsenal, campaign) {
  const games = gamesFor(arsenal, campaign)
  const heldAdv = heldAdvancementIds(arsenal)
  const heldEqp = new Set((arsenal?.equipment || []).map((e) => e.id).filter(Boolean))

  const advancements = []
  const equipment = []
  const unplaceable = []
  let claimedBoxes = 0

  for (const game of games) {
    const r = game.aftermath

    for (const t of r.advance?.taken || []) {
      if (!t.id || heldAdv.has(t.id)) continue
      const where = destinationFor(t, arsenal)
      // A totem advancement with no totem to put it on. Named rather than
      // dropped: the player should know it is still unaccounted for.
      if (!where) {
        if (t.tableId !== 'totem') unplaceable.push(t)
        continue
      }
      advancements.push({ entry: t, where, week: game.week })
    }

    for (const b of r.barter?.bought || []) {
      if (!b.rowId || heldEqp.has(b.rowId)) continue
      equipment.push({ bought: b, week: game.week })
    }

    if (r.advance?.applied && typeof r.advance.boxesApplied === 'number') {
      claimedBoxes += r.advance.boxesApplied
    }
  }

  const checked = arsenal?.leader?.experience?.boxesChecked || 0
  return {
    advancements,
    equipment,
    unplaceable,
    boxes: Math.max(0, claimedBoxes - checked),
  }
}

/**
 * The repair, described before it is done.
 *
 * `scrip` is the part that needs care. The record says the equipment was paid
 * for; that spend never happened, so restoring the row without it hands over a
 * free Gatling Gun. Deducting is what the app would have done at the time.
 *
 * **It floors at zero like every other scrip write, and says when it did.** The
 * floor can be reached honestly here — the same arsenal is usually owed its
 * p. 15 starting scrip as well, and claiming that *first* leaves enough to pay.
 * The panel says so rather than quietly rounding somebody's balance, because a
 * repair that silently changes a number is indistinguishable from the bug it is
 * repairing.
 */
export function planRepair({ arsenal, campaign } = {}) {
  if (!arsenal) return null
  const drift = aftermathDrift(arsenal, campaign)

  const spend = drift.equipment.reduce((sum, e) => sum + (e.bought.cc || 0), 0)
  const from = arsenal.scrip || 0
  const to = Math.max(0, from - spend)

  const any = Boolean(
    drift.advancements.length || drift.equipment.length || drift.boxes
  )

  return {
    ...drift,
    any,
    scrip: { spend, from, to, floored: from - spend < 0 },
  }
}

/**
 * The patch that carries a plan out.
 *
 * Everything is appended to what is already there, never substituted for it —
 * the arsenal may have collected things since the loss, and this is a repair,
 * not a restore from backup.
 */
export function repairPatch(arsenal, plan) {
  if (!arsenal || !plan?.any) return null

  const equipment = [...(arsenal.equipment || [])]
  for (const { bought, week } of plan.equipment) {
    const book = findEquipment(bought.equipmentId)
    equipment.push(createEquipment({
      // The id the record already named. Restoring under a fresh id would make
      // the row unmatchable against its own provenance, and the next drift
      // check would report it missing for ever.
      id: bought.rowId,
      equipmentId: bought.equipmentId,
      name: bought.name || book?.name || '',
      cc: bought.cc ?? book?.cc ?? 0,
      // Neither is on the record — it stores only what was bought and for how
      // much — so both come back off the book, which is where they came from.
      page: book?.page ?? null,
      thirst: isThirst(bought.equipmentId),
      acquiredWeek: week ?? null,
    }))
  }

  const toLeader = plan.advancements.filter((a) => a.where === 'leader').map((a) => a.entry)
  const toTotem = plan.advancements.filter((a) => a.where === 'totem').map((a) => a.entry)
  const toCrewCard = plan.advancements.filter((a) => a.where === 'crewCard').map((a) => a.entry)

  const patch = { equipment, scrip: plan.scrip.to }

  if (toLeader.length || plan.boxes) {
    patch.leader = {
      ...arsenal.leader,
      advancements: [...(arsenal.leader?.advancements || []), ...toLeader],
      experience: {
        ...arsenal.leader?.experience,
        boxesChecked: (arsenal.leader?.experience?.boxesChecked || 0) + plan.boxes,
      },
    }
  }

  if (toTotem.length && arsenal.totem) {
    patch.totem = {
      ...arsenal.totem,
      advancements: [...(arsenal.totem.advancements || []), ...toTotem],
    }
  }

  if (toCrewCard.length) {
    patch.crewCardAdvancements = [...(arsenal.crewCardAdvancements || []), ...toCrewCard]
  }

  return patch
}

/** The plan in the player's own words, so "are you sure?" is answerable. */
export function describeRepair(plan) {
  if (!plan?.any) return []
  const lines = []
  for (const { entry } of plan.advancements) {
    const onto = entry.appliesTo?.name ? ` on ${entry.appliesTo.name}` : ''
    lines.push(`${entry.name || 'An advancement'}${onto}`)
  }
  for (const { bought } of plan.equipment) {
    lines.push(`${bought.name || bought.equipmentId}${bought.cc ? ` (${bought.cc} scrip)` : ''}`)
  }
  if (plan.boxes) {
    lines.push(`${plan.boxes} experience box${plan.boxes === 1 ? '' : 'es'}`)
  }
  return lines
}
