import { getArchetype, SLOTS } from '../data/archetypes.js'
import { isTotem } from './indexing.js'

/**
 * Legality for a leader selection, split into two groups on purpose.
 *
 * Structural rules — how many of each slot, and whether a trigger is allowed —
 * need nothing but the archetype, so they work before any model data loads.
 * Source rules need the register. Keeping them apart is what lets the app be
 * useful offline and degrade to manual entry instead of breaking.
 */

export function checkStructure(archetypeId, picks, triggerPick) {
  const archetype = getArchetype(archetypeId)
  if (!archetype) return { ok: false, problems: ['No archetype chosen.'] }

  const problems = []
  for (const slot of SLOTS) {
    const want = archetype.slots[slot].n
    const have = picks[slot]?.length || 0
    if (have < want) problems.push(`${want - have} more ${slot} to choose.`)
    if (have > want) problems.push(`${have - want} too many ${slot} chosen.`)
  }
  if (archetype.keepsTrigger && !triggerPick) {
    problems.push('Choose a trigger from the attack action you took.')
  }
  if (!archetype.keepsTrigger && triggerPick) {
    problems.push('This archetype does not keep triggers.')
  }
  return { ok: problems.length === 0, problems }
}

export function checkSource(model, slot, archetypeId, leaderKeywords) {
  const archetype = getArchetype(archetypeId)
  const problems = []

  if (!archetype) return { ok: false, problems: ['No archetype chosen.'] }

  const cap = archetype.slots[slot].cap
  /**
   * Totems get their own message, and it is the message rather than the check
   * that earns its keep.
   *
   * Audit v0.11.0 (M4/M5) added this believing totems "HAVE costs — the cost
   * test never caught them". That belief was wrong: every totem in the register
   * has `cost: null`, so the costless test below catches all of them, and this
   * branch has never been the thing doing the barring.
   *
   * It stays because "Masters and costless models cannot be used as a source"
   * is a confusing thing to be told about a totem, which is the actual
   * complaint M4/M5 recorded. Reads the model's own characteristic now, rather
   * than an `isTotem` flag that `useRoster` set on a list totems had already
   * been filtered out of — so it was never true, and this branch never ran.
   */
  if (isTotem(model)) {
    problems.push(`${model.name} is a totem, and totems cannot be a source.`)
  }
  if (model.cost == null || model.cost <= 0) {
    problems.push('Masters and costless models cannot be used as a source.')
  } else if (model.cost > cap) {
    problems.push(`${model.name} costs ${model.cost}, over the ${cap} ceiling.`)
  }

  const shares = model.keywords.some((k) => leaderKeywords.includes(k))
  if (!shares) {
    problems.push(`${model.name} shares no keyword with your leader.`)
  }

  return { ok: problems.length === 0, problems }
}

/** Every legal pick for one slot, flattened to one row per action or ability. */
export function candidatesFor(slot, roster, archetypeId, leaderKeywords) {
  const archetype = getArchetype(archetypeId)
  if (!archetype || archetype.slots[slot].n === 0) return []

  const rows = []
  for (const model of roster) {
    if (!checkSource(model, slot, archetypeId, leaderKeywords).ok) continue

    if (slot === 'ability') {
      for (const name of model.abilities) {
        rows.push({ key: `${model.slug}::ability::${name}`, model, name, triggers: [] })
      }
    } else {
      for (const action of model.actions) {
        if (action.type !== slot) continue
        rows.push({
          key: `${model.slug}::${slot}::${action.name}`,
          model,
          name: action.name,
          triggers: action.triggers,
        })
      }
    }
  }
  return rows.sort((a, b) => a.model.cost - b.model.cost || a.name.localeCompare(b.name))
}

/** Triggers offered must come from the attack action actually taken. */
export function availableTriggers(picks) {
  return picks.attack?.[0]?.triggers || []
}

/**
 * Why the trigger a leader kept at creation cannot stand, or null.
 *
 * Only the Heavy Hitter keeps one, from the attack action it took (p. 17), and
 * `checkStructure` refuses anything else — **during creation.** Nothing looked
 * again afterwards. So a leader who chose a trigger and then changed archetype,
 * or swapped the attack action it came from, kept it: printed on the record,
 * the sheet and the PNG, with the picker that could clear it hidden because the
 * new archetype does not keep one. A trigger the player could see and could
 * not remove — reported by a player, v0.29.0.
 *
 * The third check is by name against the triggers recorded on the pick itself,
 * and only when there are some: a hand-entered pick carries none, and a
 * trigger typed in for it is an answer the app cannot check, not a mistake.
 */
export function keptTriggerProblem(leader) {
  const trigger = String(leader?.trigger || '').trim()
  if (!trigger) return null
  const archetype = getArchetype(leader.archetype)
  if (!archetype) return null
  if (!archetype.keepsTrigger) {
    return {
      kind: 'archetype',
      why: `A ${archetype.name} does not keep a trigger — only the Heavy Hitter does (p. 17)`,
    }
  }
  const attack = leader.picks?.attack?.[0]
  if (!attack) {
    return { kind: 'no-action', why: 'There is no attack action for it to come from' }
  }
  const norm = (t) => String(t?.name ?? t ?? '').trim().toLowerCase()
  const offered = attack.triggers || []
  if (offered.length && !offered.some((t) => norm(t) === norm(trigger))) {
    return { kind: 'not-on-action', why: `${trigger} is not one of ${attack.name}’s triggers` }
  }
  return null
}
