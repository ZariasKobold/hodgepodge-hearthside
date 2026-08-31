import { arsenalTotal, campaignRating, isAnnihilated, ANNIHILATION_THRESHOLD } from './campaign.js'

/**
 * The Campaign object — the shape everything else hangs off.
 *
 * Replaces the single-leader model. A campaign holds several arsenals (one per
 * player) plus a shared week log, because the rules require players to see each
 * other's numbers: max encounter size is min(both arsenals) + 6, and the
 * soulstone bonus compares campaign ratings. Arsenals are public by design.
 *
 * Mirrors docs/data-model.md. When that changes, this changes.
 *
 * NOTHING derived is stored. Current week, arsenal totals, campaign ratings and
 * injury counts are all computed on read — a stored copy is a copy that goes
 * stale the moment an injury lands.
 */

export const SCHEMA_VERSION = 2

/**
 * The starting arsenal is bought with soulstones at creation, not hired with
 * scrip, so it belongs to no week. Week 0 keeps it out of `hiresInWeek` — which
 * matters, because `isFirstOfWeek` drives the 5-scrip discount and a starting
 * arsenal counted as week-1 hires would quietly eat it.
 */
export const STARTING_ARSENAL_WEEK = 0

export const DEFAULT_HOUSE_RULES = {
  /** The book leaves a 3-cost first hire computing to −2 and never resolves it. */
  allowNegativeHireCost: false,
  surchargeBeforeDiscount: true,
  /** The book explicitly invites groups to use 3 days, or 1, or anything. */
  weekLengthDays: 7,
}

const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/* ── factories ──────────────────────────────────────────────────── */

export function createLeader(patch = {}) {
  return {
    name: '',
    archetype: '',
    characteristics: [],
    size: 2,
    base: 30,
    advancementPath: '',
    representingModel: '',
    /**
     * A square WebP data URL of the model standing in for this leader, or null.
     * Lives in the doc so it exports, syncs and survives this app going away;
     * lib/portrait.js holds the size budget that keeps it under D1's row cap.
     */
    portrait: null,
    picks: { attack: [], tactical: [], ability: [] },
    trigger: '',
    experience: { boxesChecked: 0 },
    advancements: [],
    miraculousRecoveryUsed: false,
    ...patch,
  }
}

export function createArsenal(patch = {}) {
  return {
    id: uid('ars'),
    userId: null,          // set once accounts exist
    displayName: '',
    faction: '',
    keywords: ['', ''],
    scrip: 0,
    leader: createLeader(),
    crewCard: { effect: '', choice: '' },
    models: [],
    injuries: [],
    equipment: [],
    ...patch,
  }
}

export function createCampaign(patch = {}) {
  const arsenal = patch.arsenals?.[0] || createArsenal()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('cmp'),
    name: '',
    weeksTotal: 12,
    startedAt: Date.now(),
    weekOffset: 0,
    houseRules: { ...DEFAULT_HOUSE_RULES },
    joinCode: null,
    /**
     * Which account this campaign belongs to, once it belongs to one.
     *
     * null means unclaimed — built before signing in, or created before this
     * field existed — and the first account to sync adopts it, which is the
     * behaviour CLAUDE.md §12 describes. Once set it is never reassigned
     * locally; only the account that owns it may see it on this browser.
     *
     * Added because signing out cleared nothing, so the next person to sign in
     * on a shared browser was shown the previous account's leaders under a
     * heading saying they were theirs (audit v0.11.0, H1).
     */
    ownerUserId: null,
    members: [],
    arsenals: [arsenal],
    games: [],
    /** Which arsenal belongs to this device. Replaced by userId once signed in. */
    localArsenalId: arsenal.id,
    ...patch,
  }
}

export function createModel(patch = {}) {
  return {
    id: uid('mdl'),
    slug: null,
    name: '',
    cost: 0,
    addedWeek: 1,
    scripPaid: 0,
    titleGroup: null,
    annihilated: false,
    ...patch,
  }
}

export function createGame(patch = {}) {
  return {
    id: uid('gam'),
    arsenalId: null,
    opponentArsenalId: null,
    week: 1,
    playedAt: Date.now(),
    encounterSize: null,
    strategy: '',
    schemesCompleted: 0,
    vpSelf: 0,
    vpOpponent: 0,
    result: null,           // 'win' | 'loss' | 'draw'
    withdrew: false,
    withdrewOnTurn: null,
    campaignRatingSelf: null,
    campaignRatingOpponent: null,
    equipmentHired: [],     // [{ equipmentId, modelId }] — chosen fresh each game
    killedModelIds: [],     // drives phase 6 injury flips
    aftermath: {},
    ...patch,
  }
}

/* ── selectors ──────────────────────────────────────────────────── */

/**
 * Week boundaries are a calendar fact, not a counter. Storing `currentWeek`
 * means it's wrong whenever nobody remembers to advance it, and every player's
 * device disagrees. `weekOffset` is the escape hatch for groups who skip a week.
 */
export function currentWeek(campaign, now = Date.now()) {
  const days = campaign.houseRules?.weekLengthDays || 7
  const elapsed = Math.floor((now - campaign.startedAt) / (days * 86400000))
  return Math.max(1, elapsed + 1 + (campaign.weekOffset || 0))
}

export function isCampaignOver(campaign, now = Date.now()) {
  return currentWeek(campaign, now) > campaign.weeksTotal
}

export function weeksRemaining(campaign, now = Date.now()) {
  return Math.max(0, campaign.weeksTotal - currentWeek(campaign, now))
}

/**
 * May this user see this campaign on this browser?
 *
 * Unclaimed campaigns are visible to everyone, because that is the adoption
 * path: work built before signing in has to survive signing in. A campaign
 * already stamped with someone else's id is visible to nobody else — it stays
 * in storage rather than being deleted, because the alternative is throwing
 * away work that may not have finished syncing.
 */
export function belongsTo(campaign, userId) {
  if (!campaign) return false
  if (!campaign.ownerUserId) return true
  return campaign.ownerUserId === userId
}

export function getArsenal(campaign, arsenalId) {
  return campaign.arsenals.find((a) => a.id === arsenalId) || null
}

export function myArsenal(campaign) {
  return getArsenal(campaign, campaign.localArsenalId)
}

/** Annihilated models leave the arsenal total — they can't be hired. */
export function liveModels(arsenal) {
  return arsenal.models.filter((m) => !m.annihilated)
}

export function totalFor(arsenal) {
  return arsenalTotal(liveModels(arsenal))
}

/**
 * Injuries attach to exactly one subject:
 *   modelId    — an ordinary model, or an Emissary/Effigy
 *   titleGroup — a titled model; every version shares the injury
 *   neither    — the leader
 * Stored once against the group is the only shape that can't drift.
 */
export function injuriesFor(arsenal, { modelId = null, titleGroup = null } = {}) {
  return arsenal.injuries.filter((inj) => {
    if (inj.removedAt) return false
    if (titleGroup) return inj.titleGroup === titleGroup
    if (modelId) return inj.modelId === modelId && !inj.titleGroup
    return !inj.modelId && !inj.titleGroup
  })
}

export function injuryCountForModel(arsenal, model) {
  return injuriesFor(arsenal, model.titleGroup
    ? { titleGroup: model.titleGroup }
    : { modelId: model.id }).length
}

export function modelIsAnnihilated(arsenal, model) {
  return isAnnihilated(injuryCountForModel(arsenal, model))
}

/** Every live injury in the crew, counted once per titled group. */
export function activeInjuryCount(arsenal) {
  return arsenal.injuries.filter((inj) => !inj.removedAt).length
}

/**
 * Campaign rating is per-GAME, because it counts equipment selected when
 * hiring rather than equipment owned. Pass the game's equipment list.
 */
export function ratingForGame(arsenal, game) {
  return campaignRating({
    equipmentHired: game?.equipmentHired?.length || 0,
    leaderAdvancements: arsenal.leader.advancements?.length || 0,
    totemAdvancements: 0,
    injuriesInCrew: activeInjuryCount(arsenal),
  })
}

/**
 * House rules are stored under descriptive names; `hireCost` takes short ones.
 *
 * This mapping exists because passing `campaign.houseRules` straight into
 * `hireCost` silently does nothing — it reads `allowNegative`, the campaign
 * stores `allowNegativeHireCost`, and an unrecognised key just falls back to
 * the default. A group that switched the rule on would go on being charged the
 * floored price with no error anywhere. Always go through this.
 */
export function hireRules(houseRules = {}) {
  return {
    allowNegative: houseRules.allowNegativeHireCost ?? false,
    surchargeBeforeDiscount: houseRules.surchargeBeforeDiscount ?? true,
  }
}

/**
 * Does this model sit outside both of the arsenal's keywords?
 *
 * Versatile models are exempt from the surcharge, but that is `hireCost`'s
 * business — this answers only the keyword question. Manual entries carry no
 * keyword list at all, so they are treated as in-keyword rather than guessed
 * at; the hire screen lets the player say otherwise.
 */
export function isOutOfKeyword(model, keywords = []) {
  const owned = keywords.filter(Boolean)
  const theirs = model.keywords || []
  if (!owned.length || !theirs.length) return false
  return !theirs.some((k) => owned.includes(k))
}

/** Models added during a given week, in the order they were hired. */
export function hiresInWeek(arsenal, week) {
  return arsenal.models.filter((m) => m.addedWeek === week)
}

/** Every player must add at least one model each week except the first. */
export function mustHireThisWeek(arsenal, week) {
  if (week <= 1) return false
  return !arsenal.models.some((m) => m.addedWeek === week)
}

export function gamesInWeek(campaign, arsenalId, week) {
  return campaign.games.filter((g) => g.arsenalId === arsenalId && g.week === week)
}

export { ANNIHILATION_THRESHOLD }

/* ── migration ──────────────────────────────────────────────────── */

/**
 * Lifts a v0.1 single-leader record into a campaign.
 *
 * The old shape had faction, keywords, scrip and arsenal sitting on the leader
 * itself. Those belong to the arsenal; only the leader's own fields stay.
 * Runs once, on read, when a saved leader is found and no campaign is.
 */
export function migrateLeaderToCampaign(old) {
  if (!old) return null

  const arsenal = createArsenal({
    faction: old.faction || '',
    keywords: old.keywords || ['', ''],
    displayName: '',
    leader: createLeader({
      name: old.name || '',
      archetype: old.archetype || '',
      characteristics: old.characteristics || [],
      size: old.size ?? 2,
      base: old.base ?? 30,
      advancementPath: old.advancementPath || '',
      representingModel: old.representingModel || '',
      picks: old.picks || { attack: [], tactical: [], ability: [] },
      trigger: old.trigger || '',
    }),
    crewCard: old.crewCard || { effect: '', choice: '' },
    models: (old.arsenal || []).map((m) =>
      createModel({ slug: m.slug, name: m.name, cost: m.cost, addedWeek: 1 })
    ),
  })

  return createCampaign({ arsenals: [arsenal], localArsenalId: arsenal.id })
}

/**
 * Backfills the fields `createModel` would have given a model.
 *
 * v1 let the creation wizard write `{slug, name, cost}` straight into
 * `arsenal.models`, so starting models had no `id` — and injuries, annihilation
 * and removal all key off `id`. A starting model could not be hurt. This
 * repairs stored campaigns rather than leaving two shapes in circulation.
 *
 * `addedWeek` defaults to 1 because anything without one predates the weekly
 * hire; that is where the starting arsenal belongs.
 */
function repairModel(model) {
  if (model && model.id) return model
  // An absent `addedWeek` identifies itself: weekly hires always went through
  // `createModel` and carried one, so only the creation wizard's bare writes
  // are missing it. Those are the starting arsenal.
  return createModel({
    ...model,
    addedWeek: model?.addedWeek ?? STARTING_ARSENAL_WEEK,
  })
}

/**
 * Future schema bumps chain here rather than scattering version checks.
 *
 * Each step is written to be safe to run on already-correct data, so a
 * campaign that arrives by import rather than from localStorage can be passed
 * through the same door.
 */
export function migrate(campaign) {
  if (!campaign) return null

  let next = campaign

  // v1 → v2: every model gains the fields createModel provides.
  if ((next.schemaVersion || 1) < 2 || !next.schemaVersion) {
    next = {
      ...next,
      arsenals: (next.arsenals || []).map((a) => ({
        ...a,
        models: (a.models || []).map(repairModel),
      })),
    }
  }

  return next.schemaVersion === SCHEMA_VERSION
    ? next
    : { ...next, schemaVersion: SCHEMA_VERSION }
}
