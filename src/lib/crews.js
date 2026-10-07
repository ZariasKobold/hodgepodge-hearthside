/**
 * Saved crews: hiring out of the arsenal without a game in mind.
 *
 * Owner request, Session 78: build crews ahead of time, then pick one when a
 * game starts. A saved crew is the hiring half of an encounter and nothing
 * else — models, totem, equipment and who carries it — so every function in
 * `encounter.js` that reads `modelIds`, `totem` and `equipment` reads a saved
 * crew as well, and the arithmetic exists once.
 *
 * Kept on the arsenal (`arsenal.crews`), because a crew is built from one
 * arsenal and means nothing without it. It syncs with the arsenal like
 * everything else on it. Pure (§6).
 *
 * A crew can go stale: a model in it is annihilated, a piece of kit is lost.
 * Loading one into a game takes only what is still in the arsenal, and
 * `crewGaps` says what was left behind, by name.
 */

import { uid, liveModels, liveEquipment } from './shape/arsenal.js'
import { LEADER, TOTEM } from './encounter.js'

export function createCrew(patch = {}) {
  const now = Date.now()
  return {
    id: uid('crw'),
    name: '',
    modelIds: [],
    totem: false,
    equipment: [],
    /** The size it was built for, if the player had one in mind. */
    size: null,
    createdAt: now,
    updatedAt: now,
    ...patch,
  }
}

/** The hiring fields of a crew or an encounter, and nothing else. */
export function selectionOf(source) {
  return {
    modelIds: [...(source?.modelIds || [])],
    totem: Boolean(source?.totem),
    equipment: (source?.equipment || []).map((x) => ({ rowId: x.rowId, holder: x.holder })),
  }
}

/**
 * The encounter patch that hires this crew, from what is still in the arsenal.
 * Kit on a holder who did not come along stays at camp.
 */
export function selectionFromCrew(crew, arsenal) {
  const live = new Set(liveModels(arsenal).map((m) => m.id))
  const kit = new Set(liveEquipment(arsenal).map((e) => e.id))
  const modelIds = (crew?.modelIds || []).filter((id) => live.has(id))
  const totem = Boolean(crew?.totem && arsenal?.totem)
  const holders = new Set([LEADER, ...modelIds, ...(totem ? [TOTEM] : [])])
  return {
    crewId: crew?.id ?? null,
    modelIds,
    totem,
    equipment: (crew?.equipment || [])
      .filter((x) => kit.has(x.rowId) && holders.has(x.holder))
      .map((x) => ({ rowId: x.rowId, holder: x.holder })),
  }
}

/** What a saved crew names that the arsenal no longer has, by name. */
export function crewGaps(crew, arsenal) {
  const live = new Set(liveModels(arsenal).map((m) => m.id))
  const kit = new Set(liveEquipment(arsenal).map((e) => e.id))
  const named = (list, id) => list.find((x) => x.id === id)?.name || 'something no longer on file'
  return [
    ...(crew?.modelIds || []).filter((id) => !live.has(id)).map((id) => named(arsenal?.models || [], id)),
    ...(crew?.equipment || []).filter((x) => !kit.has(x.rowId)).map((x) => named(arsenal?.equipment || [], x.rowId)),
    ...(crew?.totem && !arsenal?.totem ? ['the totem'] : []),
  ]
}

/** Add or replace one crew in the arsenal's list, stamping it. */
export function upsertCrew(crews = [], crew) {
  const stamped = { ...crew, updatedAt: Date.now() }
  return crews.some((c) => c.id === crew.id)
    ? crews.map((c) => (c.id === crew.id ? stamped : c))
    : [...crews, stamped]
}

export function removeCrew(crews = [], id) {
  return crews.filter((c) => c.id !== id)
}

/** A copy under a new id, named as a copy. */
export function copyCrew(crew) {
  return createCrew({ ...selectionOf(crew), size: crew.size ?? null, name: `${crew.name || 'Crew'} (copy)` })
}

/** A name for a crew that has none yet: "Crew 3". */
export function nextCrewName(crews = []) {
  return `Crew ${crews.length + 1}`
}
