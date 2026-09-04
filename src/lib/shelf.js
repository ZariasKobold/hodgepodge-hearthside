/**
 * The shelf: reading, writing and lifting the two kinds of document.
 *
 * `shape/` is pure and knows nothing about storage. `storage.js` is dumb and
 * knows nothing about shapes. This is the seam between them — the only module
 * that both reads localStorage and understands what an arsenal is — and it
 * exists so the hook does not have to hold both halves in its head.
 *
 * Imports nothing from React, like everything else in `lib/` (CLAUDE.md §6).
 */

import {
  campaignIds, loadCampaign, saveCampaign,
  arsenalIds, loadArsenal, saveArsenal,
  snapshotV2Campaign, v3LiftedAt, markV3Lifted,
  load, remove,
} from './storage.js'
import { createArsenal, uid } from './shape/arsenal.js'
import { createCampaign, seatArsenal, participationForArsenal } from './shape/campaign.js'
import { migrateCampaign, isLegacyCampaign, migrateLeaderToArsenal } from './shape/migrate.js'

const LEGACY_LEADER_KEY = 'leader:current'

/* ── creating ───────────────────────────────────────────────────── */

/**
 * A new arsenal, and the campaign of one it silently sits in.
 *
 * `docs/data-model-v3.md`, open question 1: *"Does a solo player have a campaign
 * at all?"* — yes, an implicit one, created here and never mentioned to them.
 * The alternative was collapsing the campaign fields onto a soloing arsenal,
 * which is less to explain and means two code paths for weeks, house rules and
 * the aftermath. One path is worth an invisible object.
 *
 * The campaign is created **before** the arsenal is stamped with its id, so the
 * two are consistent from the first write rather than after a follow-up patch.
 */
export function createSeatedArsenal(patch = {}) {
  const arsenal = createArsenal(patch)
  const blank = createCampaign({ ownerUserId: arsenal.ownerUserId ?? null })
  const seated = { ...arsenal, campaignId: blank.id }
  const campaign = {
    ...blank,
    participants: seatArsenal(blank, {
      arsenalId: seated.id,
      userId: seated.ownerUserId ?? null,
      role: 'host',
      status: 'active',
      joinedWeek: 1,
    }),
  }
  return { arsenal: seated, campaign }
}

/** Writes both halves. Returns what was actually stored. */
export function saveSeated({ arsenal, campaign }, opts = {}) {
  return {
    arsenal: arsenal ? saveArsenal(arsenal, opts) : null,
    campaign: campaign ? saveCampaign(campaign, opts) : null,
  }
}

/* ── reading ────────────────────────────────────────────────────── */

/**
 * Every arsenal on this browser, each with the campaign it is playing.
 *
 * `campaign` is null for an arsenal that has left its table or whose campaign
 * has been discarded — which is a real state, not an error. An arsenal outlives
 * its campaign by design (open question 3), so the shelf has to be able to draw
 * one that is not at a table.
 */
export function readShelf() {
  const campaigns = new Map()
  for (const id of campaignIds()) {
    const c = loadCampaign(id)
    if (c) campaigns.set(id, migrateCampaign(c).campaign)
  }
  const entries = []
  for (const id of arsenalIds()) {
    const arsenal = loadArsenal(id)
    if (!arsenal) continue
    entries.push({ arsenal, campaign: campaigns.get(arsenal.campaignId) || null })
  }
  return entries
}

export function readSeated(arsenalId) {
  const arsenal = loadArsenal(arsenalId)
  if (!arsenal) return { arsenal: null, campaign: null }
  const raw = arsenal.campaignId ? loadCampaign(arsenal.campaignId) : null
  return { arsenal, campaign: raw ? migrateCampaign(raw).campaign : null }
}

/** Is this arsenal the only one at its table? Decides whether discarding it takes the campaign too. */
export function isSoloTable(campaign, arsenalId) {
  if (!campaign) return true
  const others = (campaign.participants || []).filter((p) => p.arsenalId && p.arsenalId !== arsenalId)
  return others.length === 0
}

export { participationForArsenal }

/* ── the one-time lift ──────────────────────────────────────────── */

/**
 * Splits every stored v2 campaign into an arsenal and a table.
 *
 * Runs on load, and is safe to run on every load: `migrateCampaign` passes a v3
 * document straight through, and `isLegacyCampaign` skips anything already
 * split. The marker is bookkeeping for humans rather than a guard.
 *
 * **The v3 campaign is written back to `campaign:<id>`, the same key the v2 one
 * occupied**, because both are campaigns and keeping two keys would put two
 * shapes in circulation — the exact thing this whole change exists to end. That
 * overwrites the only local copy, so `snapshotV2Campaign` parks the original
 * first. `adoptLegacyCampaign` set that precedent and the reasoning has not
 * changed: if this goes wrong, the only copy of somebody's twelve weeks should
 * still be where it was.
 *
 * Written with `keepTimestamp`, so the lift does not claim to be a local edit.
 * Restamping would tell the sync layer this device authored the change, and it
 * did not — it reshaped a document the account has never seen in this form.
 */
export function liftLocalShelfToV3() {
  const report = { campaigns: 0, arsenals: 0, fromV01Leader: false, alreadyLifted: v3LiftedAt() }

  // Oldest shape first: the v0.1 single leader, which predates campaigns
  // entirely. Only when there is nothing else at all — a browser with a shelf
  // has already moved past it.
  const legacyLeader = load(LEGACY_LEADER_KEY)
  if (legacyLeader && campaignIds().length === 0 && arsenalIds().length === 0 && !load('campaign:current')) {
    const lifted = migrateLeaderToArsenal(legacyLeader)
    if (lifted) {
      const seated = createSeatedArsenal(lifted)
      saveSeated(seated)
      report.arsenals += 1
      report.campaigns += 1
      report.fromV01Leader = true
    }
  }

  for (const id of campaignIds()) {
    const doc = loadCampaign(id)
    if (!doc || !isLegacyCampaign(doc)) continue

    snapshotV2Campaign(doc)

    const { campaign, arsenals } = migrateCampaign(doc)
    for (const a of arsenals) {
      saveArsenal(a, { keepTimestamp: true })
      report.arsenals += 1
    }
    saveCampaign(campaign, { keepTimestamp: true })
    report.campaigns += 1
  }

  markV3Lifted()
  return report
}

/**
 * Forget an arsenal, and its table if nobody else is sitting at it.
 *
 * Never a cascade the other way: discarding a *campaign* must leave its
 * arsenals alone with `campaignId: null` (open question 3). This is the
 * narrower direction — the player is throwing away a leader, and an empty table
 * that leader was alone at is not worth keeping.
 */
export function forgetSeated(arsenalId, { removeArsenal, removeCampaign, forgetVersion }) {
  const { arsenal, campaign } = readSeated(arsenalId)
  removeArsenal(arsenalId)
  if (campaign && isSoloTable(campaign, arsenalId)) {
    removeCampaign(campaign.id)
    forgetVersion?.(campaign.id)
  } else if (campaign) {
    saveCampaign({
      ...campaign,
      participants: (campaign.participants || []).filter((p) => p.arsenalId !== arsenalId),
    })
  }
  return arsenal
}

/** Only used by the tests and the rescue path; not part of the normal flow. */
export function dropV2Snapshot(id) {
  remove(`v2-backup:campaign:${id}`)
}

/* ── settling a sync conflict ───────────────────────────────────── */

/**
 * A verbatim copy of a document under a new id.
 *
 * **Not `duplicateArsenal`.** That one deliberately drops scrip, injuries,
 * experience and advancements, because it answers "I want to play this leader at
 * a second table". This answers "both of these are real histories and I am not
 * ready to throw either away", so it keeps every field exactly as it is and
 * changes only the identity.
 *
 * `forkedFrom` is provenance rather than decoration: two cards showing the same
 * leader name are otherwise told apart only by their tallies, and a person
 * coming back to the shelf on Thursday will not remember which was which.
 */
export function forkDocument(doc) {
  if (!doc) return null
  const prefix = doc.id?.split('_')[0] || 'ars'
  return {
    ...JSON.parse(JSON.stringify(doc)),
    id: uid(prefix),
    forkedFrom: doc.id,
    forkedAt: Date.now(),
  }
}

/**
 * Settle a conflict the way the owner chose, and never destroy the loser.
 *
 * Three outcomes, and the third is the one worth defaulting to:
 *
 * - `mine`   — the local copy replaces the account's. The version bookkeeping is
 *              the interesting half: it records the server's current version as
 *              the one this device has *seen*, which is what `baseVersion` asks
 *              for. That is not a bypass. The gate's question is "have you seen
 *              the copy you are replacing?", and on this screen the answer is
 *              genuinely yes — a person was shown it and chose. A `force` flag
 *              would answer a different question, and that is the one that
 *              destroyed a leader portrait twice.
 * - `theirs` — the account's copy replaces the local one, written with
 *              `keepTimestamp` because it is the server's document and this
 *              device did not author it.
 * - `both`   — the local copy is forked to a new id and stays on the shelf, then
 *              the account's copy takes the original id. Nothing is overwritten
 *              in either direction, and the fork pushes later as an ordinary
 *              adoption because the account has no row under its new id.
 *
 * **`both` is only offered for arsenals.** A forked campaign would leave its
 * participations pointing at arsenals that still name the original table, and
 * repointing them turns one conflict into three. Campaigns are rarer and lower
 * stakes — weeks and house rules rather than twelve weeks of history — so they
 * get the two honest choices and no clever third one.
 */
export function resolveConflict({ kind, choice, mine, theirs }, deps) {
  const { rememberVersion, markDirty, saveDoc } = deps
  if (!mine && !theirs) return { resolved: null }

  if (choice === 'theirs' || choice === 'both') {
    if (choice === 'both' && kind !== 'arsenal') {
      throw new Error('Keeping both is only available for leaders, not for campaigns.')
    }
    const fork = choice === 'both' ? saveDoc(kind, forkDocument(mine)) : null
    // The server's document, written as the server's: no restamp, not dirty,
    // and based on exactly the version it arrived carrying.
    const taken = saveDoc(kind, theirs, { keepTimestamp: true })
    rememberVersion(theirs.id, theirs.version)
    markDirty(theirs.id, false)
    return { resolved: choice, kept: taken, fork }
  }

  if (choice === 'mine') {
    // Seen, and deliberately replaced. Still dirty, so the next push sends it.
    rememberVersion(mine.id, theirs?.version)
    markDirty(mine.id, true)
    return { resolved: 'mine', kept: mine, fork: null }
  }

  throw new Error(`Unknown conflict resolution: ${choice}`)
}

/** Both documents in one file, so the loser is recoverable whatever was chosen. */
export function conflictExport({ kind, mine, theirs }) {
  const key = kind === 'arsenal' ? 'arsenals' : 'campaigns'
  return {
    format: 'hodgepodge-hearthside',
    exportedAt: Date.now(),
    note: 'Both sides of a sync conflict. Importing files them as new; nothing is overwritten.',
    campaigns: [],
    arsenals: [],
    [key]: [mine, theirs].filter(Boolean),
  }
}
