/**
 * The Campaign — the table.
 *
 * Weeks, the week mode, house rules, who is playing, and the games played. In
 * v3 that is *all* it is: nothing personal lives here any more. The leader, the
 * models, the scrip and the injuries moved out to `shape/arsenal.js`, where
 * they belong to a person rather than to a table.
 *
 * ## Participation is the join
 *
 * `(campaign, user, arsenal)` — plus that player's nickname, whether they chose
 * to show their real identity, and the week they arrived. This is what
 * `campaign_members` already is in D1, gaining an `arsenal_id`.
 *
 * It replaces three things at once: `campaign.arsenals[]` (which was for other
 * players and needed a warning label), `campaign.localArsenalId` (the arsenal
 * *is* the object you have open now), and `campaigns.member_of` — a campaign
 * row pointing at another campaign row, which only ever existed because "my
 * leader's record" and "the shared game" were the same object.
 *
 * ## What is deliberately still here
 *
 * The week. It belongs to the table, not to a player: a group agrees when week
 * four is, and two players disagreeing about it is the bug. What *is* per-player
 * is `joinedWeek` on the participation, so an arsenal that arrived in week four
 * is not told it owes three missed hires.
 *
 * Imports `shape/arsenal.js`, never the other way round (CLAUDE.md §6).
 */

import { maxEncounterSize } from '../campaign.js'
import { uid, totalFor } from './arsenal.js'
import { belongsTo, shouldRelease } from './ownership.js'

export const CAMPAIGN_SCHEMA_VERSION = 3

export const DEFAULT_HOUSE_RULES = {
  /** The book leaves a 3-cost first hire computing to −2 and never resolves it. */
  allowNegativeHireCost: false,
  surchargeBeforeDiscount: true,
  /** The book explicitly invites groups to use 3 days, or 1, or anything. */
  weekLengthDays: 7,
}

/**
 * A player at the table.
 *
 * `status` keeps the two gates membership already has: redeeming an invite
 * makes you `pending`, and only the host admitting you makes you `active`. The
 * arsenal link is a third thing the player chooses and must never become a way
 * to join without being admitted — which is why `arsenalId` is nullable and
 * separate from `status`.
 *
 * `userId` is null for a participation created while signed out, and for the
 * opponents a solo player types in by hand so the encounter cap has a second
 * arsenal to compare against.
 */
export function createParticipation(patch = {}) {
  return {
    userId: null,
    /** Which arsenal from their shelf they brought. Null until they choose. */
    arsenalId: null,
    /**
     * The only identity that crosses between players by default. `shareIdentity`
     * opts in to the Discord name and avatar, per campaign, and defaults to off
     * — a privacy setting whose default leaks is not a setting.
     */
    nickname: '',
    shareIdentity: false,
    role: 'player',
    status: 'active',
    /** The campaign week this player arrived. See `mustHireThisWeek`. */
    joinedWeek: 1,
    joinedAt: Date.now(),
    ...patch,
  }
}

/**
 * A campaign.
 *
 * Created with no participants at all. A solo player gets a campaign of one the
 * moment they put an arsenal in it, silently and by the same code path as a
 * table of five — one path rather than a special case for soloing, because the
 * special case is the thing that rots.
 */
export function createCampaign(patch = {}) {
  return {
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
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
    /**
     * Which account this campaign belongs to, once it belongs to one. Same rule
     * and same field name as an arsenal's — see `shape/ownership.js`.
     */
    ownerUserId: null,
    participants: [],
    games: [],
    createdAt: Date.now(),
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

/* ── participation ──────────────────────────────────────────────── */

export function participants(campaign) {
  return campaign?.participants || []
}

export function participationForArsenal(campaign, arsenalId) {
  if (!arsenalId) return null
  return participants(campaign).find((p) => p.arsenalId === arsenalId) || null
}

export function participationForUser(campaign, userId) {
  if (!userId) return null
  return participants(campaign).find((p) => p.userId === userId) || null
}

export function activeParticipants(campaign) {
  return participants(campaign).filter((p) => p.status === 'active')
}

/**
 * The role this user has here, or null. A role rather than a boolean, so that
 * nothing downstream can accidentally treat `pending` as in.
 */
export function roleIn(campaign, userId) {
  if (!campaign) return null
  if (userId && campaign.ownerUserId === userId) return 'host'
  const p = participationForUser(campaign, userId)
  if (!p || p.status !== 'active') return null
  return p.role || 'player'
}

/**
 * Which arsenals this viewer is allowed to see at this table.
 *
 * Pending members are excluded — including from the host. Redeeming an invite
 * puts your name in front of the host so they can decide; it does not put your
 * arsenal there, and a host who could read a stranger's sheet before admitting
 * them would make the first gate decorative. `docs/data-model-v3.md`, open
 * question 4: "Can a host see a member's arsenal before admitting them? No. Say
 * so in a test."
 *
 * The rule runs both ways, which is the half that is easy to forget: only an
 * `active` member reads anything, so a player still waiting to be admitted sees
 * their own arsenal and nothing else, and a stranger sees nothing at all.
 *
 * Your own arsenal is always visible to you, whatever your status.
 */
export function visibleArsenalIds(campaign, viewerUserId) {
  const mine = participationForUser(campaign, viewerUserId)
  if (roleIn(campaign, viewerUserId) == null) {
    return mine?.arsenalId ? [mine.arsenalId] : []
  }
  const ids = activeParticipants(campaign)
    .map((p) => p.arsenalId)
    .filter(Boolean)
  if (mine?.arsenalId && !ids.includes(mine.arsenalId)) ids.push(mine.arsenalId)
  return ids
}

/**
 * The participants array with one player seated.
 *
 * Returns the array, not the campaign, so the caller does the spread and there
 * is one place that knows how a campaign is written. Idempotent on the arsenal:
 * seating an arsenal that is already here updates its row rather than adding a
 * second, because two participations for one arsenal is a shape with no
 * meaning that every count downstream would get wrong.
 */
export function seatArsenal(campaign, patch = {}) {
  const { arsenalId } = patch
  if (!arsenalId) throw new Error('A participation needs an arsenal id.')
  const existing = participationForArsenal(campaign, arsenalId)
  if (existing) {
    return participants(campaign).map((p) =>
      p.arsenalId === arsenalId ? { ...p, ...patch } : p
    )
  }
  return [...participants(campaign), createParticipation(patch)]
}

/**
 * The participants array with one arsenal removed from the table.
 *
 * The arsenal itself is untouched — `leaveCampaignPatch` is the other half, and
 * the two are deliberately separate calls on two separate documents rather than
 * one function pretending to be a transaction it cannot be.
 */
export function unseatArsenal(campaign, arsenalId) {
  return participants(campaign).filter((p) => p.arsenalId !== arsenalId)
}

/** Pending → active. Only the host may do this; that is enforced server-side. */
export function admitParticipant(campaign, userId) {
  return participants(campaign).map((p) =>
    p.userId === userId ? { ...p, status: 'active' } : p
  )
}

/**
 * The week this arsenal joined, for `mustHireThisWeek`.
 *
 * One, not zero, when nothing is recorded: the book assumes everybody starts
 * together, and a campaign migrated from v2 had exactly one player who was
 * there from the beginning.
 */
export function joinedWeekFor(campaign, arsenalId) {
  return participationForArsenal(campaign, arsenalId)?.joinedWeek || 1
}

/* ── the encounter cap ──────────────────────────────────────────── */

/**
 * Max encounter size for a pairing: the smaller arsenal total, plus six.
 *
 * Takes arsenals rather than reading them out of the campaign, because in v3
 * they are not in it — which is the improvement. This used to be a lookup into
 * a nested array that could only hold arsenals somebody had typed in by hand.
 *
 * Null with fewer than two arsenals, because a cap needs an opponent and
 * inventing one would be the app answering a question it has not been told the
 * inputs to.
 *
 * With more than two it takes the smallest total of all of them. The book
 * describes a pairing, and a multiplayer table would strictly cap each pairing
 * separately; one cap across the table is the conservative reading and the one
 * a group actually plays to, because they agree an encounter size once.
 */
export function encounterCapFor(arsenals = []) {
  const totals = arsenals.filter(Boolean).map(totalFor)
  if (totals.length < 2) return null
  return maxEncounterSize(Math.min(...totals), Math.min(...totals))
}

export { maxEncounterSize }

/* ── the week ───────────────────────────────────────────────────── */

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
 * or that agreed to replay a week nobody could make, needs the way back.
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
 * underneath it. A mode switch that moved the week would look like data loss.
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

/* ── games ──────────────────────────────────────────────────────── */

export function gamesFor(campaign, arsenalId) {
  return (campaign?.games || []).filter((g) => g.arsenalId === arsenalId)
}

export function gamesWon(campaign, arsenalId) {
  return gamesFor(campaign, arsenalId).filter((g) => g.result === 'win').length
}

export function gamesPlayed(campaign, arsenalId) {
  return gamesFor(campaign, arsenalId).length
}

export function gamesInWeek(campaign, arsenalId, week) {
  return gamesFor(campaign, arsenalId).filter((g) => g.week === week)
}

/* ── house rules ────────────────────────────────────────────────── */

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

export { belongsTo, shouldRelease }
