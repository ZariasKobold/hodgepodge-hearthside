import { planSync, stampOwner, SyncError } from './remote.js'
import { sameInSubstance } from './shape/compare.js'
import { belongsTo } from './shape/ownership.js'
import { planPull, stripSyncFields } from './shelf.js'

/**
 * Do these two copies say the same thing, ignoring sync bookkeeping?
 *
 * The remote copy always carries a `version` — `fromRow` bolts one on — and the
 * local copy never does, because it is stripped on the way in and kept in its
 * own storage key. So comparing them raw compares a field that is guaranteed to
 * differ, and `sameInSubstance` returned false every single time.
 *
 * That quietly killed the one case the app is allowed to settle by itself.
 * A conflict *means* the server's version moved away from the base this device
 * holds, so the two numbers can never match at the moment this is asked — and
 * two devices that made the identical edit were being handed a choice with no
 * difference in it. Found by testing the loops rather than the decision
 * (audit v0.21.1, H1).
 */
function settles(a, b) {
  return Boolean(a && b && sameInSubstance(stripSyncFields(a), stripSyncFields(b)))
}

/**
 * One reconciliation, as a plain function.
 *
 * This is the body that used to live inside `useSync`'s `reconcile` callback,
 * moved out for the reason §6 gives: it is a rule, not a rendering concern, and
 * a rule that cannot be called without React cannot be tested without React.
 *
 * ## Why this was worth moving
 *
 * `planSync` — the decision — has always been pure and has 29 tests. What was
 * untested was everything *around* it: the loops that carry the decision out.
 * That is where v0.21.1's bug lived. `reconcile` had no arsenal **push** loop
 * at all, because an edit script's string replace failed to match and said
 * nothing, and the suite stayed green because `mirrorArsenal` pushes on every
 * save and the end-to-end test made a save. The only broken path was the one no
 * test walked — an arsenal already dirty before the app opened, which is
 * adoption, which is the state the sync pause had left every device in. It was
 * found by looking at production and seeing no arsenal documents there.
 *
 * The lesson recorded at the time was that a green suite says nothing about a
 * path no test walks. This file is that lesson acted on: the path is now
 * walkable without a browser, an account, or a database (audit v0.21.1, H1).
 *
 * ## What is injected and what is not
 *
 * Only the side-effecting collaborators — storage, the network, and the version
 * bookkeeping — are passed in. The *decisions* (`planSync`, `planPull`,
 * `sameInSubstance`, `belongsTo`) are imported directly, because they are pure
 * and swapping them in a test would be testing a different program.
 *
 * Returns the state `useSync` renders rather than setting it, so nothing here
 * knows what a component is.
 */
export async function runReconcile({
  userId,
  storage,
  remote,
  versions,
  pushDisabled = false,
}) {
  const { campaignIds, loadCampaign, saveCampaign, arsenalIds, loadArsenal, saveArsenal } = storage
  const { listCampaigns, putCampaign, listArsenals, putArsenal } = remote
  const { knownVersion, rememberVersion, isDirty, markDirty } = versions

  // The guard the calling effect cannot provide: it holds a fresh user, this
  // holds whatever it was called with, and only this can check the one it will
  // actually use.
  if (!userId) {
    return { status: 'offline', error: null, changed: false }
  }

  /**
   * This account's campaigns, not this browser's.
   *
   * Signing out clears nothing from localStorage, so without this filter the
   * next account to sign in would try to push the previous one's campaigns, be
   * refused by the ownership gate — correctly — and see its own work fail to
   * sync behind them (audit v0.11.0, H1).
   */
  const mine = campaignIds()
    .map((id) => loadCampaign(id))
    .filter(Boolean)
    .filter((c) => belongsTo(c, userId))

  const myArsenals = arsenalIds()
    .map((id) => loadArsenal(id))
    .filter(Boolean)
    .filter((a) => belongsTo(a, userId))

  let theirs
  let theirArsenals
  try {
    // Both listings, or neither. A half-known picture is not something to
    // reason about: planning arsenals against an empty list would read every
    // local one as an adoption and push the lot.
    ;[theirs, theirArsenals] = await Promise.all([listCampaigns(), listArsenals()])
  } catch (err) {
    return {
      status: err instanceof SyncError && err.signedOut ? 'offline' : 'failed',
      pushed: 0, pulled: 0, held: 0, adopted: 0, conflicts: [],
      error: err.message,
      changed: false,
    }
  }

  /**
   * A version is recorded only where the content actually arrives — on a pull,
   * or on a push the server accepted — and never from the listing.
   *
   * The listing used to stamp one for every campaign before deciding anything,
   * to break a deadlock where a device ahead of the server could obtain a
   * version by neither route. But a version you were *told* is not a copy that
   * *incorporates* it, and the server's gate cannot tell the difference, so
   * every push passed — including from devices whose document had merged
   * nothing. That is how a portrait was destroyed by the guard meant to protect
   * it. The deadlock is gone by a different route: `planSync` asks whether the
   * copy is dirty, so a device merely ahead in clock time no longer pushes.
   */
  const { pull, push, adopted, conflicts } = planSync(mine, theirs, {
    baseOf: knownVersion,
    isDirty,
  })

  /**
   * The same function, a second time, with different inputs.
   *
   * `docs/sync-v3-plan.md` step 5 is explicit that `planSync` must be
   * **parameterised rather than rewritten**: it is pure, tested, and its four
   * outcomes are correct for any versioned document, so teaching it two kinds
   * at once would mean changing the one piece of code here that can lose twelve
   * weeks purely to avoid calling it twice.
   */
  const arsenalPlan = planSync(myArsenals, theirArsenals, {
    baseOf: knownVersion,
    isDirty,
  })

  let pulled = 0
  let pullFailure = null
  const arsenalClashes = []

  for (const remoteDoc of pull) {
    try {
      /**
       * A pulled document may be **v2** — the arsenal nested inside it — so
       * taking it means lifting it, which writes an `arsenal:<id>`. That is
       * where a week of play lives, and `planSync` decided to pull by looking
       * at the *campaign's* dirty flag, having never heard of the arsenal.
       *
       * `planPull` is the guard: it compares each arsenal by content and
       * refuses to overwrite one this device has changed, reporting a conflict
       * instead. If any arsenal in the document conflicts it writes nothing at
       * all — the campaign and its arsenals came out of one document and are
       * one decision.
       */
      const plan = planPull(remoteDoc, { loadArsenal, isDirty, sameInSubstance })
      if (plan.conflicts.length > 0) {
        arsenalClashes.push(...plan.conflicts)
        continue
      }

      for (const arsenal of plan.arsenals) {
        saveArsenal(stampOwner(arsenal, userId), { keepTimestamp: true })
        markDirty(arsenal.id, false)
      }

      saveCampaign(stampOwner(plan.campaign, userId), { keepTimestamp: true })
      // The version just handed over is, by definition, the version this copy
      // is now based on — and this copy is the account's own, so it owes the
      // account nothing.
      rememberVersion(plan.campaign.id, remoteDoc.version)
      markDirty(plan.campaign.id, false)
      pulled += 1
    } catch (err) {
      pullFailure = pullFailure || err.message
    }
  }

  /**
   * Arsenals second, and that ordering resolves an overlap rather than causing
   * one. A v2 campaign still carries its arsenal nested inside, so the pulls
   * above lift one out; a v3 campaign carries none and the arsenal arrives here
   * as its own document. Doing this second means the authoritative v3 document
   * wins wherever both exist.
   */
  for (const incoming of arsenalPlan.pull) {
    try {
      /**
       * Stripped, exactly as `planPull` strips a campaign.
       *
       * `fromRow` bolts `version` onto every remote document, and it is
       * per-device sync bookkeeping that lives in its own storage key — never
       * on the doc, where the next keystroke wipes it and where it would ride
       * into the JSON export meaning nothing. This path was the one that did
       * not strip it, so every pulled arsenal carried a stale server version
       * around in localStorage.
       */
      saveArsenal(stampOwner(stripSyncFields(incoming), userId), { keepTimestamp: true })
      rememberVersion(incoming.id, incoming.version)
      markDirty(incoming.id, false)
      pulled += 1
    } catch (err) {
      pullFailure = pullFailure || err.message
    }
  }

  let pushed = 0
  let failure = null
  /** Held, not attempted. See `PUSH_DISABLED`. */
  const held = pushDisabled ? push.length + arsenalPlan.push.length : 0

  for (const campaign of pushDisabled ? [] : push) {
    try {
      const { saved } = await putCampaign(campaign, { baseVersion: knownVersion(campaign.id) })
      saveCampaign(stampOwner(campaign, userId), { keepTimestamp: true })
      rememberVersion(campaign.id, saved?.version)
      markDirty(campaign.id, false)
      pushed += 1
    } catch (err) {
      // Carry on rather than stop. An earlier version broke out of this loop on
      // the first failure, so a single unpushable campaign kept every campaign
      // behind it from ever reaching the account (audit v0.11.0, H1).
      failure = failure || (err.stale
        ? 'Another device saved this campaign a moment ago. Nothing is lost; try again.'
        : err.message)
    }
  }

  /**
   * Arsenals last, because `arsenals.campaign_id` references `campaigns(id)`
   * and D1 enforces foreign keys — an arsenal pushed before its table names a
   * row the server does not have.
   *
   * **This is the loop that went missing in v0.21.1.** It is now covered by
   * `reconcile.test.js`, including the ordering above, which was previously
   * asserted by nothing but this comment.
   */
  for (const arsenal of pushDisabled ? [] : arsenalPlan.push) {
    try {
      const { saved } = await putArsenal(arsenal, { baseVersion: knownVersion(arsenal.id) })
      saveArsenal(stampOwner(arsenal, userId), { keepTimestamp: true })
      rememberVersion(arsenal.id, saved?.version)
      markDirty(arsenal.id, false)
      pushed += 1
    } catch (err) {
      failure = failure || (err.stale
        ? 'Another device saved this leader a moment ago. Nothing is lost; try again.'
        : err.message)
    }
  }

  /**
   * Identical copies settle themselves, and nothing else does.
   *
   * Both copies moved and moved to the same place — two devices that made the
   * same edit, or a dirty flag set by a save that changed nothing. There is no
   * choice to offer, so offering one would be diligence performed rather than
   * exercised. Provably lossless: the documents are equal, so taking either
   * loses none of the other.
   */
  const clashes = []
  for (const { id } of conflicts) {
    const a = mine.find((c) => c.id === id) || null
    const b = theirs.find((c) => c.id === id) || null
    if (settles(a, b)) {
      rememberVersion(id, b.version)
      markDirty(id, false)
      continue
    }
    clashes.push({ kind: 'campaign', id, mine: a, theirs: b })
  }
  clashes.push(...arsenalClashes)
  for (const { id } of arsenalPlan.conflicts) {
    const a = myArsenals.find((x) => x.id === id) || null
    const b = theirArsenals.find((x) => x.id === id) || null
    if (settles(a, b)) {
      rememberVersion(id, b.version)
      markDirty(id, false)
      continue
    }
    clashes.push({ kind: 'arsenal', id, mine: a, theirs: b })
  }

  const trouble = pullFailure || failure
  return {
    status: trouble ? 'failed' : clashes.length > 0 ? 'conflicted' : 'synced',
    pushed,
    pulled,
    held,
    adopted: adopted.length,
    conflicts: clashes,
    error: trouble,
    changed: pulled > 0,
  }
}
