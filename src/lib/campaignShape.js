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

/**
 * A totem, gained from the tier-3 advancement table.
 *
 * A crew may only ever have one, and once it exists the leader may hand any
 * later advancement to it instead — which is why it carries its own
 * `advancements` array. Its keywords are the leader's by rule, so they are not
 * stored: a copy here would go stale the moment a keyword changed.
 */
export function createTotem(patch = {}) {
  return {
    id: uid('ttm'),
    name: '',
    /** Which row of the totem table this came from, for the page reference. */
    tableValue: null,
    stats: { df: 5, wp: 5, sp: 6, health: 9 },
    size: 1,
    base: 30,
    characteristics: [],
    representingModel: '',
    advancements: [],
    ...patch,
  }
}

/**
 * One piece of equipment in the arsenal.
 *
 * `equipmentId` points into `data/equipment.js`; the name is copied so an
 * export still reads sensibly if that table is ever renumbered, and the page
 * travels with it so the player can find the card. No effect text (§4).
 *
 * Equipment is bought once and attached freely at each hire, so nothing here
 * records which model holds it — that is a per-game choice and lives on the
 * game's `equipmentHired`.
 */
export function createEquipment(patch = {}) {
  return {
    id: uid('eqp'),
    equipmentId: null,
    name: '',
    cc: 0,
    page: null,
    /** Those Who Thirst items are limited to one at a time; ordinary ones are not. */
    thirst: false,
    acquiredWeek: null,
    ...patch,
  }
}

/**
 * One injury upgrade.
 *
 * Attached to exactly one subject — see `injuriesFor` for the three shapes.
 * `removedAt` rather than deletion, because the back-alley doctor's ledger is
 * part of the campaign's story and a healed injury still happened.
 */
export function createInjury(patch = {}) {
  return {
    id: uid('inj'),
    name: '',
    page: null,
    modelId: null,
    titleGroup: null,
    gainedWeek: null,
    removedAt: null,
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
    /** Effects added to the crew card by tier-4 advancements. */
    crewCardAdvancements: [],
    models: [],
    injuries: [],
    equipment: [],
    totem: null,
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
    /** See `WEEK_MODES`. Calendar by default; manual is opt-in per campaign. */
    weekMode: 'calendar',
    weekOffset: 0,
    /** Read only in manual mode, but always present so the shape is one shape. */
    manualWeek: 1,
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
    /**
     * Peons may never have equipment attached, gain injuries, or be
     * annihilated (p. 37) — so they never flip in phase 6. Stored rather than
     * read off the register because a hand-typed hire has no record to read.
     */
    peon: false,
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
    /**
     * The two things only the player saw. The leader's experience depends on
     * them (p. 31) and nothing in the app can observe either, so they are
     * asked rather than guessed — a wrong guess here silently mis-advances a
     * leader for the rest of the campaign.
     */
    killedNonPeon: false,
    interactedNearEnemyDeployment: false,
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
/**
 * Two ways a campaign can know what week it is, chosen per campaign.
 *
 * `calendar` is the original and still the default: the week follows real time
 * from `startedAt`, corrected by `weekOffset`. It cannot go stale, and two
 * devices that never speak still agree.
 *
 * `manual` stores the number outright and moves only when somebody moves it.
 * Migration 0001 argued against exactly this — "a counter is only right if
 * someone remembers to press a button" — and that objection is sound for a
 * group who would rather not think about it, and beside the point for a group
 * who has decided to drive it. A campaign that meets fortnightly is *wrong* in
 * calendar mode and right in manual mode; the answer was never one of them.
 *
 * The mode is stored so the two devices agree about which question is being
 * asked, and `manualWeek` is merged by the same `updatedAt`-wins rule as scrip.
 */
export const WEEK_MODES = ['calendar', 'manual']

export function weekMode(campaign) {
  return campaign?.weekMode === 'manual' ? 'manual' : 'calendar'
}

export function currentWeek(campaign, now = Date.now()) {
  if (weekMode(campaign) === 'manual') {
    return Math.max(1, Math.round(campaign.manualWeek || 1))
  }
  return Math.max(1, elapsedWeek(campaign, now) + (campaign.weekOffset || 0))
}

/** The week the calendar alone would put you in, before any offset. */
export function elapsedWeek(campaign, now = Date.now()) {
  const days = campaign?.houseRules?.weekLengthDays || 7
  const elapsed = Math.floor((now - campaign.startedAt) / (days * 86400000))
  return elapsed + 1
}

/**
 * The `weekOffset` that makes `currentWeek` read as `target`.
 *
 * The offset exists because a real group does not keep to a calendar: they play
 * three weeks' worth on a bank holiday, or miss a fortnight, and the app
 * insisting it is week four is the app being wrong in a way the player cannot
 * argue with.
 *
 * Stored as an offset rather than as the week itself, deliberately. A stored
 * `currentWeek` stops advancing the moment nobody remembers to press the
 * button, and two devices then disagree about what week it is with no way to
 * tell which is stale. An offset keeps the calendar doing the work and records
 * only the correction — so a campaign set forward to week six on Sunday is in
 * week seven the following Sunday without anyone touching it again.
 */
export function offsetForWeek(campaign, target, now = Date.now()) {
  return Math.round(target) - elapsedWeek(campaign, now)
}

/**
 * The patch that puts a campaign in `target`, whichever mode it is in.
 *
 * One function rather than two call sites branching on the mode, because the
 * two representations are an implementation detail of the same idea and a
 * caller that has to know which one is in force will eventually get it wrong.
 * Floors at week one: there is no week zero, and a group correcting a mistake
 * should not be able to land somewhere that does not exist.
 */
export function setWeekPatch(campaign, target, now = Date.now()) {
  const week = Math.max(1, Math.round(Number(target) || 1))
  if (weekMode(campaign) === 'manual') return { manualWeek: week }
  return { weekOffset: offsetForWeek(campaign, week, now) }
}

/**
 * Forward or back by whole weeks.
 *
 * Regressing matters as much as advancing: a group that ticked over by mistake,
 * or that agreed to replay a week nobody could make, needs the way back — and
 * in calendar mode there was none, because the offset was only ever written by
 * typing an absolute number.
 */
export function stepWeekPatch(campaign, delta, now = Date.now()) {
  return setWeekPatch(campaign, currentWeek(campaign, now) + delta, now)
}

/** Would stepping back land before week one? */
export function canRegress(campaign, now = Date.now()) {
  return currentWeek(campaign, now) > 1
}

/**
 * Switching modes preserves the week on screen rather than the number
 * underneath it.
 *
 * Flipping to manual adopts whatever the calendar currently says, so nothing
 * jumps; flipping back to calendar writes the offset that reproduces the manual
 * week today, so again nothing jumps — and from then on it advances by itself.
 * A mode switch that moved the week would look like data loss.
 */
export function weekModePatch(campaign, mode, now = Date.now()) {
  const next = mode === 'manual' ? 'manual' : 'calendar'
  const showing = currentWeek(campaign, now)
  if (next === 'manual') return { weekMode: 'manual', manualWeek: showing }
  return { weekMode: 'calendar', weekOffset: offsetForWeek(campaign, showing, now) }
}

/**
 * Has the week been moved off the calendar, and by how much?
 *
 * Meaningless in manual mode, where there is no calendar to be off — reported
 * as zero so a caller cannot show "set by hand · the calendar says 3" beside a
 * number the calendar has no opinion about.
 */
export function weekAdjustment(campaign) {
  if (weekMode(campaign) === 'manual') return 0
  return campaign?.weekOffset || 0
}

/** The book recommends 4 to 12 weeks, agreed before anyone starts. */
export const MIN_WEEKS_TOTAL = 1
export const MAX_WEEKS_TOTAL = 52
export const RECOMMENDED_WEEKS = [4, 12]

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

/**
 * Should an open campaign be closed because it is not this account's?
 *
 * A function rather than a condition inline in the hook, because the condition
 * that mattered was the one that was missing. `userReady` distinguishes "nobody
 * is signed in" from "we have not asked yet": `useAuth` reports `user: null`
 * while its first request is in flight, and treating that as signed-out closed
 * the campaign the user had open and wrote the closure to storage, so it stayed
 * closed after sign-in resolved.
 */
export function shouldRelease(campaign, userId, userReady) {
  if (!userReady) return false
  if (!campaign) return false
  return !belongsTo(campaign, userId)
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

/**
 * Every live injury in the crew.
 *
 * Counted as rows, which is once per titled group **only because storage keeps
 * one row per group** — `injuriesFor` files a titled model's injury against
 * `titleGroup` rather than against each version. That is an invariant this
 * function depends on and does not enforce (audit L6); if injuries ever gain a
 * second row per group, this becomes an overcount and the campaign rating goes
 * with it.
 */
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
    totemAdvancements: arsenal.totem?.advancements?.length || 0,
    injuriesInCrew: activeInjuryCount(arsenal),
  })
}

/**
 * The part of the campaign rating that is true between games.
 *
 * Advancements minus injuries — everything except the equipment, which is
 * chosen fresh at each hire and so cannot be known until there is a game. The
 * arsenal sheet prints this beside a reminder to add one per piece of kit
 * taken, which is what the printed sheet's blank box was always asking for.
 *
 * Deliberately *not* called the campaign rating: a number that is only most of
 * the rating must not be named as though it were all of it.
 */
export function standingRating(arsenal) {
  return campaignRating({
    equipmentHired: 0,
    leaderAdvancements: arsenal.leader?.advancements?.length || 0,
    totemAdvancements: arsenal.totem?.advancements?.length || 0,
    injuriesInCrew: activeInjuryCount(arsenal),
  })
}

/** Games this arsenal has won, for the sheet's tally and competitive play. */
export function gamesWon(campaign, arsenalId = campaign?.localArsenalId) {
  return (campaign?.games || []).filter(
    (g) => g.arsenalId === arsenalId && g.result === 'win'
  ).length
}

/** Games this arsenal has played at all. */
export function gamesPlayed(campaign, arsenalId = campaign?.localArsenalId) {
  return (campaign?.games || []).filter((g) => g.arsenalId === arsenalId).length
}

/** Equipment ids currently in the arsenal, for the Those Who Thirst limit. */
export function heldEquipmentIds(arsenal) {
  return (arsenal?.equipment || []).map((e) => e.equipmentId).filter(Boolean)
}

/**
 * Injury names already on a model, so a duplicate result can be recognised.
 *
 * "If a model flips an injury result which it already has, do not apply the
 * result again" — which needs names rather than counts, and needs the titled
 * group's injuries when the model is titled.
 */
export function injuryNamesFor(arsenal, model) {
  const list = model
    ? injuriesFor(arsenal, model.titleGroup ? { titleGroup: model.titleGroup } : { modelId: model.id })
    : injuriesFor(arsenal, {})
  return list.map((inj) => inj.name)
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
