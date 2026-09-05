import { phasesFor } from './aftermath.js'

/**
 * Going back through an aftermath, and what it costs.
 *
 * ## Why this exists
 *
 * The aftermath is one walk through six phases, and until now it only went
 * forwards. That is wrong at a table: you mistype a flip, you buy the wrong
 * thing, you realise the game log said four VP and it was three. The player's
 * only recourse was to finish an aftermath they knew was wrong.
 *
 * ## Where the truth lives
 *
 * `docs/data-model-v3.md` asks for the effects to be *derived from the record
 * and reconciled* rather than appended when a button is pressed. This is that,
 * arrived at from the other side: **the record already is the provenance.**
 * Every arsenal effect the aftermath has ever applied is described by an entry
 * in the record — `bought` names the equipment, `attempts` names the injuries
 * healed, `flips` names the injuries attached, `taken` names the advancements.
 * So nothing needs tagging. Rewinding is replaying the record backwards.
 *
 * That is why this is a pure module returning a patch. It computes what the
 * arsenal *would* become; it never writes. The one caller that writes is
 * `useCampaign`, which is also the only place that knows what a React state
 * setter is (§6).
 *
 * ## The rule that keeps it safe
 *
 * **Later phases are unwound before earlier ones.** Phase 2 pays scrip that
 * phase 3 and phase 5 spend; reversing the payday before the purchases would
 * floor the balance at zero and quietly eat the refund. Reversing in strict
 * reverse phase order means every refund lands before the earning that funded
 * it is taken back.
 */

/** Phases in play for this game, skipped ones dropped. */
export function playablePhases(game) {
  return phasesFor(game).filter((p) => !p.skipped)
}

/**
 * Where a phase sits in the walk. `-1` for a phase this game never plays,
 * which is not the same as "before everything".
 */
export function phasePosition(game, phaseId) {
  return playablePhases(game).findIndex((p) => p.id === phaseId)
}

/**
 * The phase before this one, or null at the start.
 *
 * The mirror of `nextPhase`, and it exists for the same reason that one does:
 * skipped phases are not there to step onto.
 */
export function previousPhase(game, from) {
  const phases = playablePhases(game)
  const i = phases.findIndex((p) => p.id === from)
  return i > 0 ? phases[i - 1].id : null
}

/**
 * Every playable phase after this one, in order.
 *
 * These are the phases a revision puts at risk, because everything they
 * recorded was decided while the earlier phase said something else.
 */
export function phasesAfter(game, phaseId) {
  const phases = playablePhases(game)
  const i = phases.findIndex((p) => p.id === phaseId)
  return i < 0 ? [] : phases.slice(i + 1)
}

/** Has this phase had anything recorded against it? */
export function phaseHasWork(record, phaseId) {
  if (!record) return false
  switch (phaseId) {
    case 'draw_hand': return (record.handSize ?? 0) > 0
    case 'payday': return Boolean(record.paid)
    case 'barter': return Boolean(record.barter?.flipped) || (record.barter?.bought?.length ?? 0) > 0
    case 'advance_leader': return Boolean(record.advance?.applied) || (record.advance?.taken?.length ?? 0) > 0
    case 'back_alley_doctor': return (record.doctor?.attempts?.length ?? 0) > 0
    case 'determine_injuries': return (record.injuries?.flips?.length ?? 0) > 0
    default: return false
  }
}

/**
 * What revising this phase would unassign, in the player's own words.
 *
 * **The phase itself is included, and that is the point.** Revising Payday
 * while its scrip is still in the purse gives you a screen that says "Already
 * collected" and no way to change it — which is not a revision, it is a
 * read-only view with a misleading button. Undoing a phase is what makes it
 * editable again.
 *
 * Deliberately concrete — "Coffee — bought, 1 scrip back" rather than
 * "3 items" — because the whole point of asking is that the player can only
 * answer if they can see what they are giving up. A count is not an answer to
 * "are you sure?".
 */
export function revisionImpact(game, record, phaseId) {
  const here = playablePhases(game).filter((p) => p.id === phaseId)
  const scope = [...here, ...phasesAfter(game, phaseId)]
    .filter((p) => phaseHasWork(record, p.id))
  const phases = scope.map((p) => ({ id: p.id, name: p.name, items: describePhase(record, p.id) }))
  return {
    phases,
    any: phases.length > 0,
    count: phases.reduce((sum, p) => sum + p.items.length, 0),
  }
}

/** One line per thing that would be undone. */
export function describePhase(record, phaseId) {
  switch (phaseId) {
    case 'draw_hand':
      return record.handSize ? [`a hand of ${record.handSize}`] : []
    case 'payday':
      return record.paid ? [`${record.scripEarned ?? 0} scrip collected`] : []
    case 'barter': {
      const out = []
      if (record.barter?.flipped) {
        const v = record.barter.value
        out.push(`the barter flip${v != null ? ` (${v})` : ''}`)
      }
      for (const b of record.barter?.bought || []) {
        out.push(`${b.name || b.equipmentId || b} — bought${b.cc != null ? `, ${b.cc} scrip back` : ''}`)
      }
      return out
    }
    case 'advance_leader': {
      const out = (record.advance?.taken || []).map(
        (t) => `${t.name || 'an advancement'}${t.tableId ? ` (${t.tableId})` : ''}`
      )
      if (record.advance?.boxesApplied) {
        out.push(`${record.advance.boxesApplied} experience box${record.advance.boxesApplied === 1 ? '' : 'es'}`)
      }
      return out
    }
    case 'back_alley_doctor':
      return (record.doctor?.attempts || []).map(
        (a) => `Dr. Mo on ${a.injuryName || 'an injury'} — ${a.outcome?.net === 'healed' ? 'healed' : 'no result'}, 1 scrip back`
      )
    case 'determine_injuries':
      return (record.injuries?.flips || []).map(
        (f) => `${f.subjectName || f.name || 'a model'} — ${f.result?.attaches ? f.result.name : 'no injury'}`
      )
    default:
      return []
  }
}

/** A phase's slice of the record, blanked back to how it starts. */
function blankPhase(record, phaseId) {
  switch (phaseId) {
    case 'draw_hand': return { handSize: 0 }
    case 'payday': return { scripEarned: 0, paid: false }
    case 'barter':
      return { barter: { flipped: false, value: null, suit: null, thirstValue: null, cheated: false, bought: [] } }
    case 'advance_leader':
      return { advance: { experienceEarned: 0, taken: [], applied: false, boxesApplied: 0 } }
    case 'back_alley_doctor': return { doctor: { attempts: [] } }
    // `annihilated` is phase six's verdict, so it is phase six's to clear.
    case 'determine_injuries': return { injuries: { flips: [] }, annihilated: [], annihilatedNames: [] }
    default: return {}
  }
}

/**
 * The record with these phases wound back to blank.
 *
 * Pure, and it does not touch `phase` — where the player ends up is the
 * caller's decision, not this function's.
 */
export function clearedRecord(record, phaseIds) {
  let next = { ...record }
  for (const id of phaseIds) next = { ...next, ...blankPhase(next, id) }
  return next
}

/* ── the arsenal half ───────────────────────────────────────────── */

/**
 * Remove one equipment row for a purchase, and say what it refunds.
 *
 * Matched by the row id where the record carries one — every purchase made
 * since this shipped does — and by equipment id otherwise, taking the most
 * recently acquired match so that buying two of a thing and undoing once
 * removes one rather than both.
 */
function removePurchase(equipment, bought) {
  const rowId = typeof bought === 'object' ? bought.rowId : null
  const wanted = typeof bought === 'object' ? bought.equipmentId : bought

  let index = rowId ? equipment.findIndex((e) => e.id === rowId) : -1
  if (index < 0) {
    for (let i = equipment.length - 1; i >= 0; i -= 1) {
      if (equipment[i].equipmentId === wanted) { index = i; break }
    }
  }
  if (index < 0) return { equipment, refund: 0 }
  const row = equipment[index]
  return {
    equipment: [...equipment.slice(0, index), ...equipment.slice(index + 1)],
    refund: row.cc ?? 0,
  }
}

/** Everything an advancement entry touched, put back. */
function undoAdvancement(arsenal, entry) {
  const nameOf = (x) => x?.name ?? x
  const without = (list) => {
    const i = (list || []).findIndex((x) => (entry.id && x.id === entry.id) || nameOf(x) === nameOf(entry))
    return i < 0 ? list || [] : [...list.slice(0, i), ...list.slice(i + 1)]
  }

  if (entry.tableId === 'totem') {
    // The totem arrived from the tier-3 table, so undoing the advancement is
    // undoing the totem. Anything it was later given goes with it — those are
    // separate `taken` entries and are unwound in their own right.
    return { totem: null }
  }
  if (entry.tableId === 'crew-card') {
    return { crewCardAdvancements: without(arsenal.crewCardAdvancements) }
  }
  if (entry.to === 'totem') {
    return arsenal.totem
      ? { totem: { ...arsenal.totem, advancements: without(arsenal.totem.advancements) } }
      : {}
  }
  return {
    leader: { ...arsenal.leader, advancements: without(arsenal.leader?.advancements) },
  }
}

/**
 * The arsenal as it stood before these phases ran.
 *
 * Returns a **patch**, not a mutation. Phases are unwound newest-first for the
 * reason in this file's header: refunds must land before the payday that funded
 * them is taken back, or the balance floors at zero and the scrip is gone.
 *
 * Injuries and annihilations are reversible because neither was ever destroyed:
 * `healInjury` writes `removedAt` and `annihilateModel` writes a flag, both
 * chosen so the campaign's story stays legible. That decision, made for
 * readability, is what makes this possible at all.
 */
export function unwindArsenal(arsenal, record, phaseIds, { order = [] } = {}) {
  const rank = (id) => {
    const i = order.indexOf(id)
    return i < 0 ? Number.MAX_SAFE_INTEGER : i
  }
  const newestFirst = [...phaseIds].sort((a, b) => rank(b) - rank(a))

  let scrip = arsenal.scrip ?? 0
  let equipment = [...(arsenal.equipment || [])]
  let injuries = [...(arsenal.injuries || [])]
  let models = [...(arsenal.models || [])]
  let leader = { ...(arsenal.leader || {}) }
  let totem = arsenal.totem ? { ...arsenal.totem } : arsenal.totem
  let crewCardAdvancements = [...(arsenal.crewCardAdvancements || [])]

  for (const phaseId of newestFirst) {
    if (phaseId === 'determine_injuries') {
      for (const flip of record.injuries?.flips || []) {
        if (flip.rowId) injuries = injuries.filter((i) => i.id !== flip.rowId)
        else if (flip.result?.attaches) {
          const i = injuries.findIndex(
            (x) => x.name === flip.result.name
              && (x.modelId ?? null) === (flip.isLeader ? null : flip.modelId ?? null)
          )
          if (i >= 0) injuries = [...injuries.slice(0, i), ...injuries.slice(i + 1)]
        }
      }
      // Annihilation is decided at the end of phase 6 from the injuries that
      // phase attached, so undoing the phase undoes the verdict with it.
      const doomed = new Set(record.annihilated || [])
      if (doomed.size) {
        models = models.map((m) => (doomed.has(m.id) || doomed.has(m.name) ? { ...m, annihilated: false } : m))
      }
    }

    if (phaseId === 'back_alley_doctor') {
      for (const attempt of record.doctor?.attempts || []) {
        scrip += 1
        if (attempt.outcome?.heals && attempt.injuryId) {
          injuries = injuries.map((i) => (i.id === attempt.injuryId ? { ...i, removedAt: null } : i))
        }
        if (attempt.addedRowId) injuries = injuries.filter((i) => i.id !== attempt.addedRowId)
      }
    }

    if (phaseId === 'advance_leader') {
      const taken = [...(record.advance?.taken || [])].reverse()
      for (const entry of taken) {
        const patch = undoAdvancement({ leader, totem, crewCardAdvancements }, entry)
        if ('leader' in patch) leader = patch.leader
        if ('totem' in patch) totem = patch.totem
        if ('crewCardAdvancements' in patch) crewCardAdvancements = patch.crewCardAdvancements
      }
      const boxes = record.advance?.boxesApplied ?? 0
      if (boxes) {
        leader = {
          ...leader,
          experience: {
            ...(leader.experience || {}),
            boxesChecked: Math.max(0, (leader.experience?.boxesChecked || 0) - boxes),
          },
        }
      }
    }

    if (phaseId === 'barter') {
      for (const bought of [...(record.barter?.bought || [])].reverse()) {
        const out = removePurchase(equipment, bought)
        equipment = out.equipment
        scrip += out.refund
      }
    }

    if (phaseId === 'payday' && record.paid) {
      scrip = Math.max(0, scrip - (record.scripEarned ?? 0))
    }
  }

  return { scrip, equipment, injuries, models, leader, totem, crewCardAdvancements }
}
