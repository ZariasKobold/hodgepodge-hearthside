import { getArchetype, SLOTS } from '../data/archetypes.js'

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
  if (model.cost == null || model.cost <= 0) {
    problems.push('Masters, totems and costless models cannot be used as a source.')
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
