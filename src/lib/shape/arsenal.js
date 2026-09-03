/**
 * The Arsenal — the durable personal object.
 *
 * This is the book's arsenal sheet: a leader, the models hired under them, the
 * scrip in the tin, the injuries carried, the equipment bought, the experience
 * track, the advancements, and the totem if one was earned. It belongs to one
 * person. **It exists before, and independently of, any campaign.**
 *
 * That last sentence is the whole change. Until v3 an arsenal lived inside a
 * campaign, so a second leader of your own meant a second campaign — which is
 * why the live database holds six campaign rows for five users, why
 * `campaigns.member_of` is a campaign row pointing at another campaign row, and
 * why `CLAUDE.md` had to warn a reader not to put their own second leader in
 * `campaign.arsenals[]`. A field that needs a warning label is the design
 * telling you something. See `docs/data-model-v3.md`.
 *
 * D1 has believed this since migration 0001: `arsenals` has always been its own
 * table with its own id. This module moves the client document toward the
 * schema that was already underneath it.
 *
 * NOTHING derived is stored. Arsenal totals, campaign ratings and injury counts
 * are computed on read — a stored copy goes stale the moment an injury lands.
 *
 * Imports nothing from React and nothing from `campaign.js` (CLAUDE.md §6). The
 * dependency runs one way: a campaign may read arsenals, an arsenal never reads
 * a campaign.
 */

import {
  arsenalTotal, campaignRating, isAnnihilated, ANNIHILATION_THRESHOLD, startingScrip,
} from '../campaign.js'

/**
 * Arsenals and campaigns are versioned together at 3, because they were split
 * apart in the same change and a document of one kind without the other is not
 * a shape anybody should have to reason about.
 */
export const ARSENAL_SCHEMA_VERSION = 3

/**
 * The starting arsenal is bought with soulstones at creation, not hired with
 * scrip, so it belongs to no week. Week 0 keeps it out of `hiresInWeek` — which
 * matters, because `isFirstOfWeek` drives the 5-scrip discount and a starting
 * arsenal counted as week-1 hires would quietly eat it.
 */
export const STARTING_ARSENAL_WEEK = 0

export const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/**
 * Drops keys whose value is `undefined`, for callers building a patch.
 *
 * Every factory here spreads its patch **last**, so `{ id: undefined }` does not
 * mean "leave the id alone" — it overwrites the id the factory just minted with
 * nothing, and the save downstream silently no-ops on the missing id. That is a
 * real bug this project has already paid for once (`createCampaign`, audit
 * v0.5.2). The rule is: strip keys, do not blank them, and this is the tool for
 * doing it.
 */
export function defined(obj = {}) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v
  return out
}

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

/**
 * An arsenal.
 *
 * `displayName` is what the shelf shows before the leader has a name. The
 * leader's name is deliberately not copied up here — a copy goes stale on a
 * rename, which is the mistake `campaigns:index` was designed to avoid.
 */
export function createArsenal(patch = {}) {
  return {
    schemaVersion: ARSENAL_SCHEMA_VERSION,
    id: uid('ars'),
    /**
     * Which account this arsenal belongs to, once it belongs to one. null means
     * unclaimed — built before signing in — and the first account to sync
     * adopts it. See `shape/ownership.js`; the rule is shared with campaigns
     * deliberately, because two kinds of owned object must not answer "may I
     * see this?" in two places.
     */
    ownerUserId: null,
    /**
     * The campaign this arsenal is currently playing, or null.
     *
     * At most one, and that is a rule rather than a simplification. Scrip, the
     * week count and the experience track are per-campaign quantities; a leader
     * in two campaigns at once has two contradictory histories and the arsenal
     * sheet cannot print either. Wanting the same leader at a second table is
     * `duplicateArsenal` — a copy with its own history, which is honest about
     * what it is.
     */
    campaignId: null,
    displayName: '',
    faction: '',
    keywords: ['', ''],
    scrip: 0,
    /**
     * How much of the p. 15 starting-scrip grant has already been paid into
     * `scrip`. See `startingScripPatch`.
     *
     * `null` means **nobody has ever reconciled it**, which is deliberately not
     * the same as `0` ("reconciled, and the grant was nothing"). Every arsenal
     * built before v0.19.1 carries null and is owed whatever it never got — the
     * same null-versus-false distinction `isDirty` makes in `storage.js`, and
     * for the same reason: guessing "already paid" about an arsenal nobody has
     * asked would quietly keep somebody's scrip.
     */
    startingScripGranted: null,
    leader: createLeader(),
    crewCard: { effect: '', choice: '' },
    /** Effects added to the crew card by tier-4 advancements. */
    crewCardAdvancements: [],
    models: [],
    injuries: [],
    equipment: [],
    totem: null,
    createdAt: Date.now(),
    ...patch,
  }
}

/* ── the campaign link ──────────────────────────────────────────── */

/**
 * The patch that puts this arsenal at a table.
 *
 * Throws rather than silently reassigning when the arsenal is already at a
 * different table. Moving it quietly would take a leader out of a campaign
 * mid-week with no record anywhere that it happened, and the games already
 * logged against it would be orphaned — the class of quiet data loss this
 * rewrite exists to stop repeating.
 */
export function joinCampaignPatch(arsenal, campaignId) {
  if (!arsenal) return null
  if (!campaignId) throw new Error('An arsenal needs a campaign id to join one.')
  if (arsenal.campaignId && arsenal.campaignId !== campaignId) {
    throw new Error(
      'That arsenal is already in a campaign. Leave the first one, or duplicate the arsenal to play it at a second table.'
    )
  }
  return { campaignId }
}

/**
 * The patch that takes this arsenal off a table, keeping everything it earned.
 *
 * Also what a *deleted* campaign does to its arsenals — never a cascade. An
 * arsenal outliving its campaign with its history intact is the point of
 * splitting them; deleting somebody's twelve weeks because the table wound up
 * is the mistake this design exists to avoid.
 */
export function leaveCampaignPatch() {
  return { campaignId: null }
}

export function isInCampaign(arsenal) {
  return Boolean(arsenal?.campaignId)
}

/**
 * A fresh arsenal carrying this one's identity and roster, and none of its
 * history.
 *
 * The answer to "I want to play Cletus at a second table". Scrip, injuries,
 * experience, advancements and equipment are per-campaign quantities and do not
 * come along; the leader, the keywords, the crew card and the surviving models
 * do. New ids throughout, because two objects sharing an id are one object as
 * far as every merge in this app is concerned.
 *
 * The copied models are filed under `STARTING_ARSENAL_WEEK`, because at the new
 * table they are a starting arsenal — filing them under the week they were
 * hired at the *old* table would credit the new campaign with hires nobody made
 * in it and could eat a first-of-week discount.
 */
export function duplicateArsenal(arsenal, patch = {}) {
  if (!arsenal) return null
  return createArsenal({
    ownerUserId: arsenal.ownerUserId ?? null,
    campaignId: null,
    displayName: arsenal.displayName,
    faction: arsenal.faction,
    keywords: [...(arsenal.keywords || ['', ''])],
    scrip: 0,
    leader: createLeader({
      ...arsenal.leader,
      experience: { boxesChecked: 0 },
      advancements: [],
      miraculousRecoveryUsed: false,
    }),
    crewCard: { ...(arsenal.crewCard || { effect: '', choice: '' }) },
    crewCardAdvancements: [],
    models: (arsenal.models || [])
      .filter((m) => !m.annihilated)
      // `id` is stripped rather than blanked — see `defined` above.
      .map(({ id: _fresh, ...rest }) => createModel({
        ...rest,
        addedWeek: STARTING_ARSENAL_WEEK,
        scripPaid: 0,
        annihilated: false,
      })),
    injuries: [],
    equipment: [],
    totem: null,
    ...patch,
  })
}

/* ── selectors ──────────────────────────────────────────────────── */

/** Annihilated models leave the arsenal total — they can't be hired. */
export function liveModels(arsenal) {
  return (arsenal?.models || []).filter((m) => !m.annihilated)
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
  return (arsenal?.injuries || []).filter((inj) => {
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
  return (arsenal?.injuries || []).filter((inj) => !inj.removedAt).length
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
    leaderAdvancements: arsenal?.leader?.advancements?.length || 0,
    totemAdvancements: arsenal?.totem?.advancements?.length || 0,
    injuriesInCrew: activeInjuryCount(arsenal),
  })
}

/**
 * Campaign rating is per-GAME, because it counts equipment selected when
 * hiring rather than equipment owned. Pass the game's equipment list.
 */
export function ratingForGame(arsenal, game) {
  return campaignRating({
    equipmentHired: game?.equipmentHired?.length || 0,
    leaderAdvancements: arsenal?.leader?.advancements?.length || 0,
    totemAdvancements: arsenal?.totem?.advancements?.length || 0,
    injuriesInCrew: activeInjuryCount(arsenal),
  })
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

/* ── the starting scrip (p. 15) ─────────────────────────────────── */

/**
 * Soulstones spent on the **starting arsenal**, and nothing else.
 *
 * Week 0 only. The whole arsenal total is the wrong number here and was the
 * bug: p. 15's grant is measured against the 25 soulstones spent at creation,
 * so counting weekly hires as well means a week-three roster reads as 40ss
 * spent, the grant computes to zero, and a player who had been paid 3 scrip
 * would have it taken back off them.
 *
 * Annihilated models are deliberately still counted. The soulstones were spent;
 * a model dying in week four does not retroactively make the starting arsenal
 * cheaper, and filtering them would hand out scrip every time somebody died.
 * This is the opposite need to `totalFor`, which must drop them because an
 * annihilated model cannot be hired — two totals over the same list, and they
 * are not interchangeable.
 */
export function startingArsenalSpend(arsenal) {
  return arsenalTotal(
    (arsenal?.models || []).filter((m) => m.addedWeek === STARTING_ARSENAL_WEEK)
  )
}

/**
 * The patch that pays what p. 15 owes, or `null` when nothing is owed.
 *
 * > "Each soulstone a player chooses not to spend during this step becomes one
 * > scrip, up to a maximum of three scrip." — Index of the Untold, p. 15
 *
 * The creation screen has computed and *displayed* this number since v0.1 and
 * never written it anywhere, so it said "20/25 spent · 3 scrip" and the campaign
 * then began with zero. The display was right and the arsenal was wrong.
 *
 * **Reconciled, never appended.** The grant is derived from the starting
 * arsenal, `startingScripGranted` records what has already been paid, and this
 * moves the balance by the difference. Adding a model afterwards reduces the
 * grant and takes the change back; removing one pays the difference; calling it
 * ten times pays once. Appending would have been shorter and would double-pay
 * the moment anybody edited their starting arsenal twice — which is exactly the
 * mistake the aftermath phases are queued up to be fixed for.
 *
 * Floored at zero, like every other scrip write: a player who was paid 3 and has
 * since spent it does not go into debt for adding a model.
 */
export function startingScripPatch(arsenal) {
  if (!arsenal) return null
  const grant = startingScrip(startingArsenalSpend(arsenal))
  const already = arsenal.startingScripGranted ?? 0
  if (grant === already) return null
  return {
    scrip: Math.max(0, (arsenal.scrip || 0) + grant - already),
    startingScripGranted: grant,
  }
}

/**
 * Is this arsenal owed starting scrip nobody has ever paid it?
 *
 * True only for an arsenal built before this was fixed — `null` means never
 * reconciled. Used to *offer* the correction rather than apply it silently: an
 * app that moves the scrip on a campaign in progress without saying so is
 * indistinguishable from an app with a bug, and there are other people's
 * campaigns on the database now.
 */
export function owedStartingScrip(arsenal) {
  if (!arsenal || arsenal.startingScripGranted != null) return 0
  return startingScrip(startingArsenalSpend(arsenal))
}

/** Models added during a given week, in the order they were hired. */
export function hiresInWeek(arsenal, week) {
  return (arsenal?.models || []).filter((m) => m.addedWeek === week)
}

/**
 * Every player must add at least one model each week except their first.
 *
 * `joinedWeek` is the campaign week this arsenal actually arrived at the table,
 * and it matters as soon as a campaign has more than one player: an arsenal
 * that joined in week four was not delinquent in weeks two and three, and
 * telling its owner it owes three hires would be the app being confidently
 * wrong about weeks the player was not present for. Defaults to 1, which is the
 * book's assumption that everybody starts together.
 */
export function mustHireThisWeek(arsenal, week, { joinedWeek = 1 } = {}) {
  if (week <= Math.max(1, joinedWeek || 1)) return false
  return !(arsenal?.models || []).some((m) => m.addedWeek === week)
}

export { ANNIHILATION_THRESHOLD }
