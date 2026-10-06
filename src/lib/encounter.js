/**
 * Hiring a crew for one encounter, out of the arsenal (p. 19).
 *
 * The crew builder's arithmetic, pure (§6). Phase A of the plan in
 * `docs/data-model-v3.md` § "The crew builder": one side, on this device, with
 * the opponent's numbers typed or read off the table's shared page. Phase B
 * adds the shared, hidden-until-revealed session on top of exactly this.
 *
 * ## The rules it holds, from p. 19
 *
 * - **You may only hire models in your current arsenal**, and you need not hire
 *   them all. Annihilated models are not in it.
 * - **Leader and totem cost 0.** The leader is always in the crew. The totem is
 *   optional, like any other model.
 * - **Out-of-keyword models cost 1 more, Versatile excepted**, as in any hire.
 *   Owner decision, Session 74. Worked out, never ticked (owner decision,
 *   Session 77): a model hired off the register carries its keyword slugs and
 *   characteristics, which §4 keeps because the legality rules need them. A
 *   model with no keywords on file (the starting arsenal, which only offered
 *   in-keyword and Versatile models, a defector, a hand-typed hire) is treated
 *   as in keyword, as `isOutOfKeyword` already does.
 * - **Equipment attaches to any model, free** — one row of the arsenal to one
 *   model. Peons may never carry it (p. 37). Annihilated kit is not hirable.
 * - **The encounter size** is agreed, at most the smaller arsenal plus six.
 *   The hired crew must fit inside it.
 * - **Excess soulstones go to the pool as normal**, to the usual maximum of six,
 *   and the crew with the lower rating adds the difference, up to three, which
 *   may go past six.
 * - **The campaign rating** is the kit selected at hiring, plus the leader's
 *   and totem's advancements, minus the injuries **in the crew**. Owner
 *   decision, Session 74: the hired crew, not the whole arsenal, because the
 *   book works it out "after hiring and revealing crews". So a totem left at
 *   home brings neither its advancements nor anything else.
 */

import {
  uid, liveModels, liveEquipment, injuryCountForModel, injuriesFor, totalFor, isOutOfKeyword,
} from './shape/arsenal.js'
import { isVersatile } from './indexing.js'
import { campaignRating, soulstoneBonus, maxEncounterSize } from './campaign.js'

/** The two holders that are not rows of `arsenal.models`. */
export const LEADER = 'leader'
export const TOTEM = 'totem'

/** Out-of-keyword surcharge at an encounter hire. The same 1 as a weekly hire. */
export const KEYWORD_TAX = 1

/** "The usual maximum of 6 soulstones" in a starting pool. */
export const POOL_MAX = 6

/**
 * A crew being hired.
 *
 * Lives on the player's own campaign document beside `games`, so it survives a
 * closed tab and syncs like anything else. `gameId` is set when the game it
 * became is logged, and from then on the encounter is a record, not a draft.
 */
export function createEncounter(patch = {}) {
  return {
    id: uid('enc'),
    arsenalId: null,
    week: 1,
    status: 'hiring',           // 'hiring' | 'played'
    createdAt: Date.now(),
    opponent: {
      name: '',
      /** Their arsenal's soulstone total, for the cap. Typed or read off the table. */
      arsenalTotal: null,
      /** Set when picked from the table's shared page. */
      arsenalId: null,
      /** Their campaign rating for this game, for the pool bonus. Theirs to say. */
      rating: null,
    },
    /** Agreed. `null` means "the cap", which is the usual answer. */
    encounterSize: null,
    strategy: '',
    modelIds: [],
    totem: false,
    /** `{ rowId, holder }` — an equipment row of the arsenal, and who carries it. */
    equipment: [],
    gameId: null,
    ...patch,
  }
}

/** The encounter this arsenal is hiring for right now, if any. */
export function openEncounter(campaign, arsenalId) {
  return (campaign?.encounters || []).find(
    (e) => e.arsenalId === arsenalId && e.status === 'hiring'
  ) || null
}

/** The hired models that are still in the arsenal, in arsenal order. */
export function hiredModels(encounter, arsenal) {
  const ids = new Set(encounter?.modelIds || [])
  return liveModels(arsenal).filter((m) => ids.has(m.id))
}

/**
 * Does this model pay the out-of-keyword surcharge in this arsenal's crew?
 * Neither of the arsenal's two keywords, and not Versatile.
 */
export function paysKeywordTax(model, arsenal) {
  return !isVersatile(model) && isOutOfKeyword(model, arsenal?.keywords || [])
}

/** What one model costs at this hire. */
export function hireCostOf(model, arsenal) {
  return (model.cost || 0) + (paysKeywordTax(model, arsenal) ? KEYWORD_TAX : 0)
}

/** Soulstones spent on the crew. Leader and totem are free. */
export function crewCost(encounter, arsenal) {
  return hiredModels(encounter, arsenal).reduce((sum, m) => sum + hireCostOf(m, arsenal), 0)
}

/** The largest encounter these two arsenals allow, or null without their total. */
export function encounterCap(arsenal, opponentTotal) {
  if (opponentTotal == null || opponentTotal === '' || !Number.isFinite(Number(opponentTotal))) return null
  return maxEncounterSize(totalFor(arsenal), Number(opponentTotal))
}

/** The size being hired to: the agreed one, else the cap. */
export function encounterSizeOf(encounter, arsenal) {
  const agreed = encounter?.encounterSize
  if (agreed != null && agreed !== '' && Number.isFinite(Number(agreed))) return Number(agreed)
  return encounterCap(arsenal, encounter?.opponent?.arsenalTotal)
}

/** Equipment rows attached to somebody who is in the crew, and still hirable. */
export function hiredEquipment(encounter, arsenal) {
  const live = new Map(liveEquipment(arsenal).map((e) => [e.id, e]))
  const holders = new Set([LEADER, ...(encounter?.modelIds || [])])
  if (encounter?.totem && arsenal?.totem) holders.add(TOTEM)
  return (encounter?.equipment || [])
    .filter((x) => live.has(x.rowId) && holders.has(x.holder))
    .map((x) => ({ ...x, row: live.get(x.rowId) }))
}

/**
 * Injuries in the hired crew: the leader's, and each hired model's.
 *
 * A titled model's injuries are filed once against its title group, so two
 * versions of one titled model in a crew would otherwise count them twice.
 * Grouped here by subject for the same reason `activeInjuryCount` counts rows.
 * The totem carries no injuries in this app.
 */
export function crewInjuryCount(encounter, arsenal) {
  let n = injuriesFor(arsenal, {}).length
  const seenGroups = new Set()
  for (const m of hiredModels(encounter, arsenal)) {
    if (m.titleGroup) {
      if (seenGroups.has(m.titleGroup)) continue
      seenGroups.add(m.titleGroup)
    }
    n += injuryCountForModel(arsenal, m)
  }
  return n
}

/** This crew's campaign rating for the game (p. 19). */
export function crewRating(encounter, arsenal) {
  const withTotem = Boolean(encounter?.totem && arsenal?.totem)
  return campaignRating({
    equipmentHired: hiredEquipment(encounter, arsenal).length,
    leaderAdvancements: arsenal?.leader?.advancements?.length || 0,
    totemAdvancements: withTotem ? (arsenal.totem.advancements?.length || 0) : 0,
    injuriesInCrew: crewInjuryCount(encounter, arsenal),
  })
}

/**
 * The starting soulstone pool, as far as it can be known.
 *
 * `leftover` is what the hire did not spend, `fromHire` the part of it that
 * reaches the pool, and `bonus` the lower-rated crew's difference. The bonus
 * needs the opponent's rating, so without it the answer says so rather than
 * assuming zero.
 */
export function poolFor(encounter, arsenal) {
  const size = encounterSizeOf(encounter, arsenal)
  if (size == null) return null
  const leftover = Math.max(0, size - crewCost(encounter, arsenal))
  const fromHire = Math.min(leftover, POOL_MAX)
  const theirs = encounter?.opponent?.rating
  const known = theirs != null && theirs !== '' && Number.isFinite(Number(theirs))
  const bonus = known ? soulstoneBonus(crewRating(encounter, arsenal), Number(theirs)) : null
  return {
    leftover,
    fromHire,
    lostOverMax: leftover - fromHire,
    bonus,
    total: bonus == null ? null : fromHire + bonus,
  }
}

/**
 * What stops this crew being played, in words a player can act on.
 *
 * Only what is proven. A crew with no encounter size known yet is not wrong,
 * it is unfinished, and says so separately (`ready`).
 */
export function encounterProblems(encounter, arsenal) {
  const problems = []
  const cap = encounterCap(arsenal, encounter?.opponent?.arsenalTotal)
  const size = encounterSizeOf(encounter, arsenal)
  const spent = crewCost(encounter, arsenal)

  if (cap != null && size != null && size > cap) {
    problems.push(`The encounter is ${size}ss and these two arsenals allow at most ${cap}ss.`)
  }
  if (size != null && spent > size) {
    problems.push(`The crew costs ${spent}ss, ${spent - size} over the ${size}ss encounter.`)
  }

  const live = new Set(liveModels(arsenal).map((m) => m.id))
  const gone = (encounter?.modelIds || []).filter((id) => !live.has(id))
  if (gone.length) {
    problems.push(`${gone.length === 1 ? 'A hired model is' : `${gone.length} hired models are`} no longer in the arsenal.`)
  }

  const byId = new Map(liveModels(arsenal).map((m) => [m.id, m]))
  const seen = new Set()
  for (const x of encounter?.equipment || []) {
    if (seen.has(x.rowId)) problems.push('One piece of equipment is on two models.')
    seen.add(x.rowId)
    const holder = byId.get(x.holder)
    if (holder?.peon) problems.push(`${holder.name} is a peon, and peons may never carry equipment (p. 37).`)
  }
  return problems
}

/** Everything known and nothing wrong: the crew can be taken to the table. */
export function encounterReady(encounter, arsenal) {
  return encounterSizeOf(encounter, arsenal) != null && encounterProblems(encounter, arsenal).length === 0
}

/* ── editing, as patches ────────────────────────────────────────── */

/** Hire or release one model. Releasing it takes its equipment off. */
export function toggleModel(encounter, modelId) {
  const hired = encounter.modelIds.includes(modelId)
  if (!hired) return { modelIds: [...encounter.modelIds, modelId] }
  return {
    modelIds: encounter.modelIds.filter((id) => id !== modelId),
    equipment: (encounter.equipment || []).filter((x) => x.holder !== modelId),
  }
}

export function toggleTotem(encounter) {
  return encounter.totem
    ? { totem: false, equipment: (encounter.equipment || []).filter((x) => x.holder !== TOTEM) }
    : { totem: true }
}

/** Put one equipment row on a holder, or take it off with `holder = null`. */
export function attachEquipment(encounter, rowId, holder) {
  const rest = (encounter.equipment || []).filter((x) => x.rowId !== rowId)
  return { equipment: holder ? [...rest, { rowId, holder }] : rest }
}

/* ── into the game ──────────────────────────────────────────────── */

/**
 * The fields of the game this crew became.
 *
 * The aftermath used to ask for the rating, the encounter size and a *count*
 * of equipment, because nothing had the inputs. Now the encounter has them, so
 * they arrive as facts, and `equipmentHired` names the actual pieces and who
 * carried them.
 */
export function gameFieldsFrom(encounter, arsenal) {
  const theirs = encounter?.opponent?.rating
  return {
    encounterId: encounter.id,
    opponent: encounter.opponent?.name || '',
    opponentArsenalId: encounter.opponent?.arsenalId || null,
    strategy: encounter.strategy || '',
    encounterSize: encounterSizeOf(encounter, arsenal),
    campaignRatingSelf: crewRating(encounter, arsenal),
    campaignRatingOpponent: theirs != null && theirs !== '' ? Number(theirs) || 0 : 0,
    equipmentHired: hiredEquipment(encounter, arsenal).map((x) => ({
      equipmentId: x.row.equipmentId,
      rowId: x.rowId,
      modelId: x.holder === LEADER || x.holder === TOTEM ? null : x.holder,
      holder: x.holder,
    })),
    hiredModelIds: [...(encounter.modelIds || [])],
    totemHired: Boolean(encounter.totem && arsenal?.totem),
  }
}
