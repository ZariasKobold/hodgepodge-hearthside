/**
 * v2 → v3: splitting the arsenal out of the campaign.
 *
 * Every campaign this app has ever saved holds a leader inside it. v3 makes the
 * arsenal a top-level object and leaves the campaign as the table. This module
 * is the lift, and it is the single most dangerous file in the change: it runs
 * over somebody's twelve weeks, once, on read.
 *
 * ## The rules it works to
 *
 * - **Ids are preserved, never re-minted.** The arsenal keeps its existing
 *   `ars_…` id and the campaign keeps its `cmp_…`, so the D1 rows that already
 *   exist line up rather than orphaning — `arsenals` has had its own id since
 *   migration 0001. Re-minting here would silently double every row on the
 *   server the first time a device synced after upgrading.
 * - **Nothing is dropped.** `campaign.arsenals[]` was documented as being for
 *   *other players*, and nothing in the client has ever written a second entry
 *   into it — but if one is found it becomes its own arsenal seated as an
 *   opponent rather than being quietly discarded.
 * - **Every step is safe to run twice.** A v3 document passed through comes out
 *   unchanged, so an import and a load can go through the same door.
 * - **The v1 model repair survives.** v1 wrote bare `{slug,name,cost}` into
 *   `arsenal.models`, so those models have no `id` — and injuries, annihilation
 *   and removal all key off `id`. A starting model could not be hurt. That
 *   repair is carried forward here rather than left behind in the old module.
 *
 * ## What is NOT done, on purpose
 *
 * Several v2 campaigns belonging to one person are **not** merged into one
 * campaign, even though "six campaign rows for five users" is the mess that
 * motivated this whole change. Merging would mean guessing that two leaders
 * played at the same table, and reconciling two week counts, two start dates
 * and two sets of house rules by picking a winner. That is the shape of every
 * bug this project has had. Each v2 campaign becomes one campaign and one
 * arsenal, faithfully; moving an arsenal to another table afterwards is a
 * deliberate act by a person who knows whether it belongs there.
 */

import {
  createArsenal, createLeader, createModel, ARSENAL_SCHEMA_VERSION,
  STARTING_ARSENAL_WEEK, uid,
} from './arsenal.js'
import {
  createCampaign, createParticipation, createGame, CAMPAIGN_SCHEMA_VERSION,
} from './campaign.js'

/* ── recognising what you have been handed ──────────────────────── */

/**
 * A v2 (or v1) campaign: the leader lives inside it.
 *
 * The `!Array.isArray(doc.campaigns)` half is not decoration. A **v3 export
 * bundle** also carries an `arsenals` array, so the naive test calls a bundle a
 * campaign — and `readBundle` then threw the campaigns away and filed the
 * bundle's arsenals as though they had been nested inside it. Caught by its own
 * test; the two shapes overlap on exactly one field name.
 */
export function isLegacyCampaign(doc) {
  return Boolean(doc) && Array.isArray(doc.arsenals) && !Array.isArray(doc.campaigns)
}

export function isV3Campaign(doc) {
  return Boolean(doc) && !Array.isArray(doc.arsenals) && Array.isArray(doc.participants)
}

export function isV3Arsenal(doc) {
  return Boolean(doc) && !Array.isArray(doc.arsenals) && Array.isArray(doc.models) && Boolean(doc.leader)
}

/* ── the pieces ─────────────────────────────────────────────────── */

/**
 * Backfills the fields `createModel` would have given a model.
 *
 * An absent `addedWeek` identifies itself: weekly hires always went through
 * `createModel` and carried one, so only the creation wizard's bare writes are
 * missing it. Those are the starting arsenal, and filing them under week 1
 * instead would let them eat the first-of-week discount.
 */
export function repairModel(model) {
  if (model && model.id) return model
  return createModel({
    ...model,
    addedWeek: model?.addedWeek ?? STARTING_ARSENAL_WEEK,
  })
}

/**
 * One v2 nested arsenal as a top-level v3 arsenal.
 *
 * Idempotent: a v3 arsenal passed in comes back with its models repaired and
 * nothing else touched.
 */
export function migrateArsenal(arsenal, { ownerUserId = null, campaignId = null, updatedAt = null } = {}) {
  if (!arsenal) return null
  const lifted = createArsenal({
    ...arsenal,
    // Its own if it has one, the campaign's if not, and absent only when
    // neither knows — see `splitLegacyCampaign`.
    ...(arsenal.updatedAt ?? updatedAt ? { updatedAt: arsenal.updatedAt ?? updatedAt } : {}),
    schemaVersion: ARSENAL_SCHEMA_VERSION,
    // `??` not `||`: an arsenal already carrying an owner keeps it, and one
    // carrying null adopts the campaign's. An empty string is not an owner.
    ownerUserId: arsenal.ownerUserId ?? ownerUserId ?? null,
    campaignId: arsenal.campaignId ?? campaignId ?? null,
    leader: createLeader(arsenal.leader || {}),
    models: (arsenal.models || []).map(repairModel),
    injuries: arsenal.injuries || [],
    equipment: arsenal.equipment || [],
    crewCardAdvancements: arsenal.crewCardAdvancements || [],
    createdAt: arsenal.createdAt ?? Date.now(),
  })
  return lifted
}

/**
 * The v0.1 single-leader record, as an arsenal.
 *
 * The oldest shape this app ever wrote: faction, keywords, scrip and the roster
 * all sat on the leader itself. Only the leader's own fields stay on the leader.
 *
 * Inlined here rather than chained through v2's `migrateLeaderToCampaign` so
 * that `shape/` has no dependency on the module it replaces, and the old one
 * can be deleted outright at the cutover. It has never been run against
 * anything but a synthetic record (CLAUDE.md, "Never verified"), which is an
 * argument for keeping it short and obvious rather than clever.
 */
export function migrateLeaderToArsenal(old) {
  if (!old) return null
  return createArsenal({
    faction: old.faction || '',
    keywords: old.keywords || ['', ''],
    scrip: old.scrip || 0,
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
      createModel({ slug: m.slug, name: m.name, cost: m.cost, addedWeek: STARTING_ARSENAL_WEEK })
    ),
  })
}

/**
 * A v2 campaign, split into the table and the arsenals that were inside it.
 *
 * Returns `{ campaign, arsenals }`. The arsenal named by `localArsenalId` is
 * seated as the host; any other (there should be none — see the header) is
 * seated as an opponent so nothing is lost.
 */
export function splitLegacyCampaign(doc) {
  if (!doc) return null

  const owner = doc.ownerUserId ?? null
  const nested = Array.isArray(doc.arsenals) ? doc.arsenals.filter(Boolean) : []
  const localId = doc.localArsenalId || nested[0]?.id || null

  const arsenals = nested.map((a) =>
    migrateArsenal(a, {
      ownerUserId: owner,
      campaignId: doc.id,
      /**
       * A v2 nested arsenal has no `updatedAt` of its own — it was part of the
       * campaign, so the campaign's was the only clock. Inheriting it is the
       * honest answer to "when was this last touched?": the arsenal is exactly
       * as recent as the document it came out of.
       *
       * Without this the conflict screen shows "no save time recorded" on both
       * sides, which removes the single most orienting fact from the one screen
       * where somebody is choosing between two copies of their campaign.
       */
      updatedAt: doc.updatedAt,
    })
  )

  const participants = arsenals.map((a) =>
    createParticipation({
      // Only the local arsenal is this account's. The others were typed in to
      // give the encounter cap a second total to compare against; they have no
      // account behind them and must not be handed one.
      userId: a.id === localId ? owner : null,
      arsenalId: a.id,
      role: a.id === localId ? 'host' : 'opponent',
      status: 'active',
      // The book assumes everybody starts together, and a v2 campaign had
      // exactly one player who was there from the beginning.
      joinedWeek: 1,
      joinedAt: doc.startedAt ?? Date.now(),
    })
  )

  const {
    arsenals: _lifted, localArsenalId: _retired, members: _serverSide,
    joinCode: _neverUsed, schemaVersion: _bumped, ...rest
  } = doc

  const campaign = createCampaign({
    ...rest,
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    ownerUserId: owner,
    participants,
    games: (doc.games || []).map((g) => createGame(g)),
    createdAt: doc.createdAt ?? doc.startedAt ?? Date.now(),
  })

  return { campaign, arsenals }
}

/**
 * Anything that might be a campaign, as `{ campaign, arsenals }`.
 *
 * The one door. A v3 campaign comes back with an empty `arsenals` list, because
 * in v3 its arsenals are not inside it — the caller reads those from the
 * arsenal shelf by id.
 */
export function migrateCampaign(doc) {
  if (!doc) return null
  if (isLegacyCampaign(doc)) return splitLegacyCampaign(doc)
  return {
    campaign: createCampaign({
      ...doc,
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      participants: (doc.participants || []).map((p) => createParticipation(p)),
      games: (doc.games || []).map((g) => createGame(g)),
    }),
    arsenals: [],
  }
}

/**
 * A whole shelf of stored documents, lifted together.
 *
 * Takes the campaigns as they sit in storage today and returns both collections
 * for the caller to write. Deduplicates by id, last write winning, because a
 * shelf that somehow held the same campaign twice should not produce two rows
 * on the server.
 */
export function migrateShelf(docs = []) {
  const campaigns = new Map()
  const arsenals = new Map()
  for (const doc of docs) {
    const lifted = migrateCampaign(doc)
    if (!lifted) continue
    campaigns.set(lifted.campaign.id, lifted.campaign)
    for (const a of lifted.arsenals) arsenals.set(a.id, a)
  }
  return { campaigns: [...campaigns.values()], arsenals: [...arsenals.values()] }
}

/* ── export and import ──────────────────────────────────────────── */

export const EXPORT_FORMAT = 'hodgepodge-hearthside'

/**
 * The file a player takes with them.
 *
 * Permission to build on Wyrd's IP is revocable at any time (CLAUDE.md §8), so
 * a campaign has to survive this app going away — and in v3 that means two
 * collections rather than one, because an arsenal without its campaign is still
 * a whole arsenal sheet and is worth keeping on its own.
 */
export function bundle({ campaigns = [], arsenals = [] } = {}) {
  return {
    format: EXPORT_FORMAT,
    schemaVersion: CAMPAIGN_SCHEMA_VERSION,
    exportedAt: Date.now(),
    campaigns,
    arsenals,
  }
}

/**
 * Anything a player might drop on the import button, as `{ campaigns, arsenals }`.
 *
 * Every shape this app has ever exported has to come back in, because an export
 * this app cannot read is not a rescue (audit v0.11.0, H2/H3):
 *
 *   - a bare v2 campaign            — the original single-campaign export
 *   - an array of v2 campaigns      — never shipped, accepted anyway
 *   - `{ campaigns: [...] }`        — the shelf rescue on the sign-in gate
 *   - `{ campaigns, arsenals }`     — v3
 *   - a bare v3 arsenal             — new: an arsenal is exportable on its own
 */
export function readBundle(data) {
  if (!data) return { campaigns: [], arsenals: [] }

  if (Array.isArray(data)) return foldIn(data)

  // The bundle test comes first and is deliberately narrow. A v2 campaign is
  // *also* an object with an `arsenals` array, and reading one as a bundle
  // silently discards the campaign and keeps only the arsenals that were
  // inside it — which is data loss on the one path that exists to prevent it.
  const looksLikeBundle = data.format === EXPORT_FORMAT || Array.isArray(data.campaigns)
  if (looksLikeBundle) {
    return foldIn([...(data.campaigns || []), ...(data.arsenals || [])])
  }
  return foldIn([data])
}

function foldIn(docs) {
  const campaignDocs = []
  const loose = []
  for (const doc of docs) {
    if (!doc) continue
    if (isV3Arsenal(doc)) loose.push(migrateArsenal(doc))
    else campaignDocs.push(doc)
  }
  const { campaigns, arsenals } = migrateShelf(campaignDocs)
  const byId = new Map(arsenals.map((a) => [a.id, a]))
  for (const a of loose) if (!byId.has(a.id)) byId.set(a.id, a)
  return { campaigns, arsenals: [...byId.values()] }
}

/**
 * Fresh ids throughout, with every link inside the file repointed.
 *
 * Importing must **file** rather than overwrite: importing the same export
 * twice gives two campaigns, and nothing already on the shelf can be lost by
 * importing (CLAUDE.md §12b). That means new top-level ids — and the moment the
 * ids move, `participation.arsenalId`, `arsenal.campaignId` and every
 * `game.arsenalId` are pointing at objects that no longer exist. This is the
 * part an import gets wrong silently, so it is one function with tests.
 *
 * Model, injury and equipment ids are **not** re-minted. They are unique within
 * their arsenal and nothing outside the arsenal refers to them, so re-minting
 * would gain nothing and would have to be threaded through `injury.modelId`,
 * `game.killedModelIds` and `game.equipmentHired` to avoid breaking them.
 *
 * An arsenal whose `campaignId` names a campaign that is not in the file comes
 * out detached. It cannot mean the campaign of that id on this device — that
 * one may belong to somebody else entirely — and a dangling pointer is worse
 * than an arsenal sitting on the shelf waiting to be seated.
 */
export function refileForImport({ campaigns = [], arsenals = [] } = {}) {
  const campaignIds = new Map()
  const arsenalIds = new Map()
  for (const c of campaigns) campaignIds.set(c.id, uid('cmp'))
  for (const a of arsenals) arsenalIds.set(a.id, uid('ars'))

  const refiledArsenals = arsenals.map((a) => ({
    ...a,
    id: arsenalIds.get(a.id),
    // Whoever exported it, it is this account's now — and unstamped, so the
    // first sign-in adopts it by the ordinary path.
    ownerUserId: null,
    campaignId: campaignIds.get(a.campaignId) ?? null,
  }))

  const refiledCampaigns = campaigns.map((c) => ({
    ...c,
    id: campaignIds.get(c.id),
    ownerUserId: null,
    participants: (c.participants || []).map((p) => ({
      ...p,
      // The nickname crosses; the account id does not. A user id outlives the
      // campaign and correlates an arsenal to a person forever, which is what
      // the nickname exists to prevent — and an imported file is not a
      // membership record, it is a copy. Re-admitting is a deliberate act.
      userId: null,
      arsenalId: arsenalIds.get(p.arsenalId) ?? null,
    })),
    games: (c.games || []).map((g) => ({
      ...g,
      arsenalId: arsenalIds.get(g.arsenalId) ?? null,
      opponentArsenalId: arsenalIds.get(g.opponentArsenalId) ?? null,
    })),
  }))

  return { campaigns: refiledCampaigns, arsenals: refiledArsenals }
}
