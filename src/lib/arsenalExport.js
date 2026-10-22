/**
 * The whole arsenal, as one file another tool can read without this app.
 *
 * The plain export (`bundle`) is a backup: the two documents exactly as stored,
 * which this app reads back and nothing else needs to understand. That is the
 * right file for a rescue and the wrong one for anybody else, because the
 * documents name things by id — `mdl_…` in a game's killed list, `"to":
 * "leader"` on an advancement — and the names live on another document or in
 * this app's data tables.
 *
 * This file is both. `campaigns` and `arsenals` are the bundle, untouched, so
 * `readBundle` imports it like any other export and nothing here can lose data
 * on the way back in. Beside them sits a **resolved** view: the leader with
 * archetype, faction, keywords and stat line; the roster by name with each
 * model's live injuries; the current scrip, kit and injuries as they stand
 * (not replayed from history, which cannot see the starting arsenal or
 * anything done outside an aftermath); the campaign's games with every id
 * turned back into a name; and `subjects`, one lookup from every id in the
 * file to who it is.
 *
 * Everything resolved is derived on export and never stored (arsenal.js: NOTHING
 * derived is stored). No rules text goes in (§4): names, costs, pages, the
 * archetype's stat line and each action's Skl and signature, which are facts,
 * and nothing a card says.
 */

import { getArchetype } from '../data/archetypes.js'
import { getEffect } from '../data/crewCards.js'
import { factionLabel } from '../data/factions.js'
import { findTable, EXPERIENCE_BOXES } from '../data/advancements.js'
import {
  liveModels, totalFor, injuriesFor, standingRating, STARTING_ARSENAL_WEEK,
} from './shape/arsenal.js'
import { currentWeek, gamesWon, gamesFor } from './shape/campaign.js'
import { bundle } from './shape/migrate.js'
import {
  totemPicks, advancedAction, advancementsOn, gainedActions, gainedActionKey,
} from './advancement.js'
import { leaderSignature, gainedSignature } from './signature.js'
import { findEntry } from './rules.js'

export const FULL_EXPORT_KIND = 'full-arsenal'

/**
 * Bumped when the resolved half changes shape. The bundle half has its own.
 *
 * 2 (v0.36.0): every attack and tactical action, chosen or gained, carries
 * `signature` and `skl`, each with a `…Source` saying where it came from, and
 * `leader.gainedActions` lists the tier-2 actions. `signature: null` means
 * nobody has said, never "not signature".
 */
export const FULL_EXPORT_VERSION = 2

/** Which model card a pick came from, by name, whether picked or typed. */
function sourceName(pick) {
  if (!pick) return null
  if (typeof pick.model === 'string') return pick.model || null
  return pick.model?.name ?? null
}

function sourceSlugOf(pick) {
  if (!pick || pick.manual) return null
  if (pick.model?.slug) return pick.model.slug
  const head = String(pick.key || '').split('::')[0]
  return head && head !== 'manual' ? head : null
}

function resolvePick(pick) {
  return {
    key: pick.key ?? null,
    name: pick.name,
    fromModel: sourceName(pick),
    fromSlug: sourceSlugOf(pick),
    manual: Boolean(pick.manual),
  }
}

/**
 * Skl as the leader rolls it, and where the number came from.
 *
 * An advancement's `statTo` is absolute and wins (`advancement`). Otherwise a
 * chosen action keeps its card's Skl (p. 17), read off the register card if
 * the caller fetched it (`register`), and a gained action has the book's
 * (`book`). With none of those it is null: unknown, never 0.
 */
function sklOf(base, baseSource, earned) {
  const { stat, statChanged } = advancedAction(base, earned)
  if (statChanged) return { skl: stat, sklSource: 'advancement' }
  if (base?.stat == null || base.stat === '') return { skl: null, sklSource: null }
  return { skl: Number.isNaN(Number(base.stat)) ? base.stat : Number(base.stat), sklSource: baseSource }
}

/** A chosen attack or tactical action, with its signature and Skl. */
function resolveActionPick(pick, slot, leader, cardFor) {
  const slug = sourceSlugOf(pick)
  const entry = slug ? findEntry(cardFor(slug), slot, pick.name) : null
  const { signature, source } = leaderSignature(leader, pick)
  return {
    ...resolvePick(pick),
    signature,
    signatureSource: source,
    ...sklOf(entry, 'register', advancementsOn(leader, pick.key)),
  }
}

/** Actions from the tier-2 Action table, which are lines on the card too. */
function resolveGained(leader) {
  const byKey = new Map((leader.advancements || []).map((a) => [gainedActionKey(a), a]))
  return gainedActions(leader).map((g) => {
    const { signature, source } = gainedSignature(leader, byKey.get(g.key))
    return {
      key: g.key,
      name: g.name,
      slot: g.slot,
      page: g.page,
      signature,
      signatureSource: source,
      ...sklOf(g.base, 'book', advancementsOn(leader, g.key)),
    }
  })
}

function resolveAdvancement(adv, subjects) {
  const table = findTable(adv.tableId)
  return {
    id: adv.id ?? null,
    name: adv.name,
    table: table?.name ?? adv.tableName ?? adv.tableId ?? null,
    tier: table?.tier ?? null,
    tableValue: adv.tableValue ?? null,
    page: adv.page ?? table?.page ?? null,
    appliesTo: adv.appliesTo ?? null,
    week: adv.week ?? null,
    ...(adv.to ? { to: adv.to, toName: subjects[adv.to]?.name ?? null } : {}),
  }
}

function injuryLine(inj) {
  return { id: inj.id, name: inj.name, page: inj.page ?? null, gainedWeek: inj.gainedWeek ?? null }
}

/**
 * Every id the documents use for a crew member, and who it is.
 *
 * `leader` is a key as well as an id, because that is how an aftermath record
 * names the leader. Annihilated models are kept: a game in week three still
 * names the model that died in it.
 */
export function subjectsOf(arsenal) {
  const subjects = {
    leader: { kind: 'leader', name: arsenal?.leader?.name || null },
  }
  if (arsenal?.totem) {
    subjects[arsenal.totem.id] = { kind: 'totem', name: arsenal.totem.name || null }
  }
  for (const m of arsenal?.models || []) {
    subjects[m.id] = { kind: 'model', name: m.name, slug: m.slug ?? null, annihilated: Boolean(m.annihilated) }
  }
  for (const e of arsenal?.equipment || []) {
    subjects[e.id] = { kind: 'equipment', name: e.name, equipmentId: e.equipmentId ?? null }
  }
  for (const inj of arsenal?.injuries || []) {
    subjects[inj.id] = { kind: 'injury', name: inj.name }
  }
  return subjects
}

function named(subjects, id) {
  return { id, name: subjects[id]?.name ?? null }
}

/** Who carried a piece of kit into a game: a model id, or `leader` / `totem`. */
function holderOf(e, subjects) {
  if (e.modelId) return named(subjects, e.modelId)
  if (e.holder === 'leader') return { id: 'leader', name: subjects.leader.name }
  if (e.holder === 'totem') {
    const totem = Object.entries(subjects).find(([, s]) => s.kind === 'totem')
    return { id: totem?.[0] ?? 'totem', name: totem?.[1].name ?? null }
  }
  return null
}

function resolveLeader(arsenal, subjects, cardFor) {
  const leader = arsenal.leader || {}
  const archetype = getArchetype(leader.archetype)
  const effect = getEffect(arsenal.crewCard?.effect)
  const boxes = leader.experience?.boxesChecked || 0
  return {
    name: leader.name || null,
    // A campaign leader is built, not printed: no Malifaux card is its base.
    // The archetype gives the stat line, the picks say which cards its
    // actions were taken from, and `representingModel` is the miniature.
    builtFrom: 'archetype',
    archetype: archetype ? { id: archetype.id, name: archetype.name, page: 17 } : { id: leader.archetype || null },
    stats: archetype ? { ...archetype.stats } : null,
    size: leader.size ?? null,
    base: leader.base ?? null,
    faction: { slug: arsenal.faction || null, name: arsenal.faction ? factionLabel(arsenal.faction) : null },
    keywords: (arsenal.keywords || []).filter(Boolean),
    characteristics: leader.characteristics || [],
    representingModel: leader.representingModel || null,
    advancementPath: leader.advancementPath || null,
    picks: {
      attack: (leader.picks?.attack || []).map((p) => resolveActionPick(p, 'attack', leader, cardFor)),
      tactical: (leader.picks?.tactical || []).map((p) => resolveActionPick(p, 'tactical', leader, cardFor)),
      ability: (leader.picks?.ability || []).map(resolvePick),
    },
    gainedActions: resolveGained(leader),
    trigger: leader.trigger || null,
    crewCard: {
      effect: effect ? { id: effect.id, name: effect.name, page: effect.page } : null,
      choice: arsenal.crewCard?.choice || null,
      advancements: arsenal.crewCardAdvancements || [],
    },
    experience: {
      boxesChecked: boxes,
      boxesTotal: EXPERIENCE_BOXES.length,
    },
    advancements: (leader.advancements || []).map((a) => resolveAdvancement(a, subjects)),
    injuries: injuriesFor(arsenal, {}).map(injuryLine),
    miraculousRecoveryUsed: Boolean(leader.miraculousRecoveryUsed),
    annihilatedWeek: leader.annihilatedWeek ?? null,
  }
}

function resolveTotem(arsenal, subjects) {
  const totem = arsenal.totem
  if (!totem) return null
  const own = totemPicks(totem)
  return {
    id: totem.id,
    name: totem.name || null,
    tableValue: totem.tableValue ?? null,
    stats: { ...totem.stats },
    size: totem.size ?? null,
    base: totem.base ?? null,
    characteristics: totem.characteristics || [],
    representingModel: totem.representingModel || null,
    chosenAction: totem.chosenAction ?? null,
    actions: [...own.attack, ...own.tactical].map((a) => a.name),
    abilities: own.ability.map((a) => a.name),
    advancements: (totem.advancements || []).map((a) => resolveAdvancement(a, subjects)),
    injuries: injuriesFor(arsenal, { modelId: totem.id }).map(injuryLine),
  }
}

function resolveModel(arsenal, m) {
  const injuries = injuriesFor(arsenal, m.titleGroup ? { titleGroup: m.titleGroup } : { modelId: m.id })
  return {
    id: m.id,
    name: m.name,
    slug: m.slug ?? null,
    cost: m.cost ?? 0,
    addedWeek: m.addedWeek ?? null,
    startingArsenal: (m.addedWeek ?? STARTING_ARSENAL_WEEK) === STARTING_ARSENAL_WEEK,
    scripPaid: m.scripPaid ?? 0,
    titleGroup: m.titleGroup ?? null,
    peon: Boolean(m.peon),
    defected: Boolean(m.defected),
    annihilated: Boolean(m.annihilated),
    injuries: injuries.map(injuryLine),
  }
}

function resolveGame(game, arsenal, subjects) {
  const mine = game.arsenalId === arsenal.id
  return {
    id: game.id,
    week: game.week,
    playedAt: game.playedAt ?? null,
    side: mine ? 'this arsenal' : 'opponent',
    encounterSize: game.encounterSize ?? null,
    strategy: game.strategy || null,
    schemesCompleted: game.schemesCompleted ?? 0,
    vpSelf: game.vpSelf ?? 0,
    vpOpponent: game.vpOpponent ?? 0,
    result: game.result ?? null,
    withdrew: Boolean(game.withdrew),
    withdrewOnTurn: game.withdrewOnTurn ?? null,
    campaignRatingSelf: game.campaignRatingSelf ?? null,
    campaignRatingOpponent: game.campaignRatingOpponent ?? null,
    hired: (game.hiredModelIds || []).map((id) => named(subjects, id)),
    totemHired: Boolean(game.totemHired),
    // A game logged by hand stores only a count, as empty slots.
    equipmentHired: (game.equipmentHired || []).map((e) => (e ? {
      equipmentId: e.equipmentId ?? null,
      equipment: subjects[e.rowId]?.name ?? null,
      holder: holderOf(e, subjects),
    } : { equipmentId: null, equipment: null, holder: null })),
    killed: (game.killedModelIds || []).map((id) => named(subjects, id)),
    killedNonPeon: Boolean(game.killedNonPeon),
    interactedNearEnemyDeployment: Boolean(game.interactedNearEnemyDeployment),
    aftermathDone: Boolean(game.aftermath?.done),
  }
}

function resolveCampaign(campaign, arsenal, subjects, now) {
  if (!campaign) return null
  const games = gamesFor(campaign, arsenal.id)
  return {
    id: campaign.id,
    name: campaign.name || null,
    week: currentWeek(campaign, now),
    weeksTotal: campaign.weeksTotal ?? null,
    weekMode: campaign.weekMode ?? null,
    startedAt: campaign.startedAt ?? null,
    houseRules: campaign.houseRules || {},
    players: (campaign.participants || []).map((p) => ({
      nickname: p.nickname || null,
      arsenalId: p.arsenalId ?? null,
      role: p.role ?? null,
      joinedWeek: p.joinedWeek ?? null,
      thisArsenal: p.arsenalId === arsenal.id,
    })),
    gamesPlayed: games.length,
    gamesWon: gamesWon(campaign, arsenal.id),
    games: games.map((g) => resolveGame(g, arsenal, subjects)),
  }
}

/**
 * The file. `arsenal` is required; `campaign` may be null for an arsenal not at
 * a table, which still exports everything about itself.
 *
 * `cards` is `{ slug: card }` from `rules.js`, for the chosen actions' Skl. It
 * stays pure by being handed in: the caller fetches, and a card that could not
 * be read leaves that Skl null rather than failing the export.
 */
export function fullArsenalExport({ arsenal, campaign = null, now = Date.now(), build = null, cards = null }) {
  if (!arsenal) throw new Error('Nothing to export: no arsenal is open.')
  const subjects = subjectsOf(arsenal)
  const models = liveModels(arsenal)

  return {
    ...bundle({ campaigns: campaign ? [campaign] : [], arsenals: [arsenal] }),
    exportedAt: now,
    kind: FULL_EXPORT_KIND,
    kindVersion: FULL_EXPORT_VERSION,
    app: build ? { version: build.version ?? null, commit: build.commit ?? null } : null,
    arsenalId: arsenal.id,
    leader: resolveLeader(arsenal, subjects, (slug) => cards?.[slug] ?? null),
    totem: resolveTotem(arsenal, subjects),
    state: {
      scrip: arsenal.scrip ?? 0,
      startingScripGranted: arsenal.startingScripGranted ?? null,
      soulstones: totalFor(arsenal),
      modelCount: models.length,
      standingRating: standingRating(arsenal),
      week: campaign ? currentWeek(campaign, now) : null,
    },
    roster: (arsenal.models || []).map((m) => resolveModel(arsenal, m)),
    equipment: (arsenal.equipment || []).map((e) => ({
      id: e.id,
      equipmentId: e.equipmentId ?? null,
      name: e.name,
      cost: e.cc ?? 0,
      page: e.page ?? null,
      thirst: Boolean(e.thirst),
      acquiredWeek: e.acquiredWeek ?? null,
      held: !e.annihilated,
      annihilatedWeek: e.annihilatedWeek ?? null,
    })),
    injuries: (arsenal.injuries || []).map((inj) => ({
      ...injuryLine(inj),
      on: inj.titleGroup
        ? { titleGroup: inj.titleGroup, name: (arsenal.models || []).find((m) => m.titleGroup === inj.titleGroup)?.name ?? null }
        : inj.modelId ? named(subjects, inj.modelId) : { id: 'leader', name: subjects.leader.name },
      active: !inj.removedAt,
      removedAt: inj.removedAt ?? null,
    })),
    campaign: resolveCampaign(campaign, arsenal, subjects, now),
    subjects,
  }
}

/** The register cards whose Skl the export reads: one per chosen action's source. */
export function exportCardSlugs(arsenal) {
  const picks = arsenal?.leader?.picks || {}
  return [...new Set([...(picks.attack || []), ...(picks.tactical || [])].map(sourceSlugOf).filter(Boolean))]
}

/** A filename that says what it is and for whom. */
export function fullExportFilename(arsenal) {
  const stem = (arsenal?.leader?.name || arsenal?.displayName || 'leader')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'leader'
  return `${stem}-arsenal.json`
}
