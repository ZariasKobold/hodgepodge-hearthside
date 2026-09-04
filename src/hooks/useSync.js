import { useState, useEffect, useCallback, useRef } from 'react'
import { remote, remoteArsenals, planSync, stampOwner, SyncError } from '../lib/remote.js'
import {
  saveCampaign, loadCampaign, campaignIds, knownVersion, rememberVersion,
  isDirty, markDirty, saveArsenal, loadArsenal, arsenalIds, removeArsenal,
} from '../lib/storage.js'
import {
  belongsTo,
} from '../lib/shape/ownership.js'
import { sameInSubstance } from '../lib/shape/compare.js'
import { resolveConflict, conflictExport, planPull } from '../lib/shelf.js'
import { exportJSON } from '../lib/storage.js'
/**
 * Keeps the local shelf and the account's shelf in step.
 *
 * Local-first, deliberately. localStorage is written synchronously by
 * `useCampaign` and is what the running app reads; this pushes copies to D1 and
 * pulls down anything the account already holds. Every failure here is
 * survivable — the app carries on against local storage exactly as it did
 * before any of this existed, which is the promise CLAUDE.md §12 makes about
 * the remote adapter not being a stepping stone.
 *
 * The reconciliation runs once when a user appears. That is the moment work
 * built while signed out becomes theirs: anything on this browser that the
 * account has never seen is pushed up and associated with them.
 */
/**
 * The kill switch. **Off as of v0.21.0** — both kinds now sync.
 *
 * It was true from the v3 cutover until step F, and the reason is worth keeping
 * rather than deleting, because it is the shape of the next emergency: the
 * server held **v2** documents where the arsenal was nested inside the campaign,
 * while this client held v3 where it is a separate document. A push would have
 * replaced a player's server copy with a campaign that had no arsenal in it, and
 * their arsenal — by then the only copy — would never have been sent.
 *
 * What made it safe to flip:
 *
 * - migrations 0005 and 0006, so an arsenal is a first-class row with its own
 *   `doc`, `schema_version` and `version`, and survives its campaign;
 * - `arsenalStore.js` and `/api/arsenals`, written to `campaignStore.js`'s
 *   one-gate rule with their own attack tests;
 * - `putCampaign` no longer assuming `campaign.arsenals[0]`, and the campaigns
 *   route no longer *requiring* it — that check would have rejected every v3
 *   campaign;
 * - a shape gate on both stores, refusing any write that would walk a row's
 *   `schema_version` backwards, which is the guard against a tab left open from
 *   before the cutover;
 * - `planSync` called once per kind rather than rewritten.
 *
 * Leave the constant here. Flipping it back is a one-line, one-deploy stop if
 * anything about the two-kind sync turns out to be wrong on a real device, and
 * that is worth more than the tidiness of removing it.
 */
export const PUSH_DISABLED = false

export function useSync({ user, available, onChanged }) {
  const [state, setState] = useState({
    // idle | syncing | synced | failed | offline | paused | conflicted
    status: 'idle',
    pushed: 0,
    pulled: 0,
    /** Local edits the account has not been sent, because pushing is off. */
    held: 0,
    adopted: 0,
    /**
     * Structured, and deliberately not folded into `error`.
     *
     * It used to be an English sentence stuffed into `error`, which made a
     * conflict indistinguishable from a failure and gave the UI nothing to
     * render but prose. A conflict is neither a failure nor a success: it is a
     * state with two documents in it that a person has to choose between, so it
     * is carried as the two documents.
     */
    conflicts: [],
    error: null,
    at: null,
  })

  // Once per signed-in user. Without this the effect would re-reconcile on
  // every render that produced a new `user` object identity.
  const reconciledFor = useRef(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  /**
   * `user` and `available` are in the dependency list, and that is the whole
   * fix for a bug that lost work.
   *
   * They were not, and the deps were `[onChanged]` alone — which App passes as
   * `useCampaign`'s `refresh`, a `useCallback` with an empty dependency list
   * and therefore stable for the life of the app. So this callback was built
   * exactly once, on the first render, when `useAuth` is still loading and
   * `user` is null. Every later reconcile ran against that first closure and
   * saw `user === null` no matter who had signed in.
   *
   * The effect below could not notice: its own closure is fresh, so it checked
   * a real user, set `reconciledFor`, and called a function that could not see
   * one. Everything then failed in a way that looked like nothing happening —
   * `belongsTo(c, undefined)` matched only unclaimed campaigns, and the pull
   * loop threw on `user.id` with no catch around it, leaving the status stuck
   * on `syncing` for ever.
   *
   * What that looked like from outside: sign in on a second device, and the
   * shelf says "Checking your account for campaigns…" and stays empty, while
   * the campaign is sitting on the server perfectly intact. `mirror` was
   * unaffected — its deps are correct — so pushes worked and pulls did not,
   * which is why the data got up but never came back down.
   */
  const reconcile = useCallback(async () => {
    // The guard the effect cannot provide: it holds a fresh `user`, this holds
    // whatever it was built with, and only this one can check the one it will
    // actually use.
    if (!user?.id) {
      setState((s) => ({ ...s, status: 'offline', error: null }))
      return
    }
    setState((s) => ({ ...s, status: 'syncing', error: null }))

    /**
     * This account's campaigns, not this browser's.
     *
     * Signing out clears nothing from localStorage, so without this filter the
     * next account to sign in would try to push the previous one's campaigns,
     * be refused by the ownership gate — correctly — and see its own work fail
     * to sync behind them (audit v0.11.0, H1).
     */
    const mine = campaignIds()
      .map((id) => loadCampaign(id))
      .filter(Boolean)
      .filter((c) => belongsTo(c, user?.id))

    const myArsenals = arsenalIds()
      .map((id) => loadArsenal(id))
      .filter(Boolean)
      .filter((a) => belongsTo(a, user?.id))

    let theirs
    let theirArsenals
    try {
      // Both listings, or neither. A half-known picture is not something to
      // reason about: planning arsenals against an empty list would read every
      // local one as an adoption and push the lot.
      ;[theirs, theirArsenals] = await Promise.all([remote.list(), remoteArsenals.list()])
    } catch (err) {
      if (!alive.current) return
      setState({
        status: err instanceof SyncError && err.signedOut ? 'offline' : 'failed',
        pushed: 0, pulled: 0, held: 0, adopted: 0, conflicts: [],
        error: err.message,
        at: Date.now(),
      })
      return
    }

    /**
     * The listing **is** the server stating its current version for every
     * campaign, so record it before deciding anything.
     *
     * Without this the whole scheme deadlocks, and it did. A version was only
     * ever learned from a pull or an accepted push — so a device whose local
     * copy was *newer* than the server's could obtain one by neither route: it
     * never pulled, because it was ahead, and its push was refused for having
     * no base version. The shelf sat on "not saved to your account" for ever
     * with no way out. Every device already holding work when the version check
     * shipped was in exactly that position.
     *
     * Recording here is not a loophole in the check. `baseVersion` has to be a
     * version the server told us, and this is the server telling us, in the
     * request immediately before the write. If another device writes in the gap
     * between this list and our PUT, the stored `updated_at` moves past what we
     * recorded and we are refused — which is the check working, not failing.
     */
    /**
     * The listing no longer records anything, and that is a correction rather
     * than a revert.
     *
     * It used to stamp a version for every campaign here, before deciding
     * anything, to break a deadlock where a device ahead of the server could
     * obtain a version by neither route. But recording a version you were
     * *told* is not the same as holding a copy that *incorporates* it, and
     * the gate in `putCampaign` could not tell the difference — so every
     * push passed, including from devices whose document had merged nothing.
     * That is how a portrait was destroyed after the guard meant to protect
     * it shipped.
     *
     * A version is now recorded only where the content actually arrives: on a
     * pull, or on a push the server accepted. The deadlock it was fixing is
     * gone by a different route — `planSync` asks whether this copy is dirty,
     * so a device that is merely *ahead in clock time* no longer tries to
     * push at all.
     */
    const { pull, push, adopted, conflicts } = planSync(mine, theirs, {
      baseOf: knownVersion,
      isDirty,
    })

    /**
     * The same function, a second time, with different inputs.
     *
     * Step 5 of the plan is explicit that `planSync` must be **parameterised
     * rather than rewritten**: it is pure, tested, and its four outcomes are
     * correct for any versioned document, so teaching it to understand two
     * kinds at once would be changing the one piece of code here that can lose
     * twelve weeks in order to avoid calling it twice.
     */
    const arsenalPlan = planSync(myArsenals, theirArsenals, {
      baseOf: knownVersion,
      isDirty,
    })

    /**
     * Pull first. If the push half fails, the browser has still gained whatever
     * the account held, and nothing local was thrown away to get it.
     * Anything the server hands back is this account's by definition — it was
     * fetched with their session — so stamp it on the way in.
     *
     * Wrapped, because this loop was the one that threw. An exception here used
     * to escape `reconcile` entirely: `remote.list` had its own catch, and
     * everything after it had none, so a throw became an unhandled rejection
     * and the status stayed on `syncing` for ever. **A sync that fails has to
     * say so** — the shelf's "Checking your account for campaigns…" is drawn
     * from that status, and a spinner that never resolves is the one failure
     * mode a local-first app should not have.
     */
    let pulled = 0
    let pullFailure = null
    const arsenalClashes = []
    for (const remoteDoc of pull) {
      try {
        /**
         * A pulled document is **v2** — the arsenal is nested inside it — so
         * taking it means lifting it, which writes an `arsenal:<id>`. That is
         * where a week of play lives, and `planSync` decided to pull by looking
         * at the *campaign's* dirty flag, having never heard of the arsenal.
         *
         * `planPull` is the guard: it compares each arsenal by content and
         * refuses to overwrite one this device has changed, reporting a
         * conflict instead. If any arsenal in the document conflicts it writes
         * nothing at all — the campaign and its arsenals came out of one
         * document and are one decision.
         */
        const plan = planPull(remoteDoc, { loadArsenal, isDirty, sameInSubstance })
        if (plan.conflicts.length > 0) {
          arsenalClashes.push(...plan.conflicts)
          continue
        }

        for (const arsenal of plan.arsenals) {
          saveArsenal(stampOwner(arsenal, user.id), { keepTimestamp: true })
          // No version is recorded against an arsenal yet: the server has no
          // arsenal documents at all (`doc IS NULL` on every row), so there is
          // no number to record. Step F gives them their own. Clearing the
          // dirty flag is honest either way — this copy now *is* the account's.
          markDirty(arsenal.id, false)
        }

        saveCampaign(stampOwner(plan.campaign, user.id), { keepTimestamp: true })
        // The version we were just handed is, by definition, the version this
        // copy is now based on — and this copy is the account's own, so it
        // owes the account nothing.
        rememberVersion(plan.campaign.id, remoteDoc.version)
        markDirty(plan.campaign.id, false)
        pulled += 1
      } catch (err) {
        pullFailure = pullFailure || err.message
      }
    }

    /**
     * Arsenals second, and that ordering resolves an overlap rather than
     * causing one.
     *
     * A **v2** campaign still carries its arsenal nested inside, so the pulls
     * above lift one out. A **v3** campaign carries none, and the arsenal
     * arrives here instead, as its own document. Doing this second means the
     * authoritative v3 document wins wherever both exist — and once a row has
     * been pushed as v3 the nested copy is gone from the server anyway, so the
     * overlap is temporary by construction.
     */
    for (const incoming of arsenalPlan.pull) {
      try {
        saveArsenal(stampOwner(incoming, user.id), { keepTimestamp: true })
        rememberVersion(incoming.id, incoming.version)
        markDirty(incoming.id, false)
        pulled += 1
      } catch (err) {
        pullFailure = pullFailure || err.message
      }
    }

    let pushed = 0
    let failure = null
    /**
     * Held, not attempted. See PUSH_DISABLED — the server cannot store a v3
     * campaign without losing the arsenal, so the honest thing is to keep the
     * work here and say so, rather than send something that reads as saved.
     */
    const held = PUSH_DISABLED ? push.length + arsenalPlan.push.length : 0
    for (const campaign of PUSH_DISABLED ? [] : push) {
      try {
        const { saved } = await remote.put(campaign, { baseVersion: knownVersion(campaign.id) })
        // Claimed now that the account has actually accepted it, and recorded
        // at the version it assigned — without which the very next mirror
        // would be refused as stale.
        saveCampaign(stampOwner(campaign, user.id), { keepTimestamp: true })
        rememberVersion(campaign.id, saved?.version)
        // The account has it now. Anything typed after this marks it again.
        markDirty(campaign.id, false)
        pushed += 1
      } catch (err) {
        // Carry on rather than stop. An earlier version broke out of this loop
        // on the first failure, so a single unpushable campaign kept every
        // campaign behind it from ever reaching the account (audit v0.11.0, H1).
        //
        // A conflict here means another device wrote between our listing and
        // our push, which is a race rather than a fault and is fixed by trying
        // again. The server's own wording — "pull before pushing" — is an
        // instruction to a program, not to a person reading a shelf.
        failure = failure || (err.stale
          ? 'Another device saved this campaign a moment ago. Nothing is lost; try again.'
          : err.message)
      }
    }

    if (!alive.current) return
    /**
     * A conflict is not an error, and it is not a success either.
     *
     * Both copies moved, so nothing was written in either direction and
     * nothing was lost. It is reported because the alternative — picking a
     * winner quietly — is the behaviour this whole module exists to stop.
     */
    /**
     * The advice this used to give was impossible to follow.
     *
     * It said "open it on one device and save to settle it" — and saving cannot
     * settle anything, because a conflict means the copy is already dirty and
     * the base version already differs. Saving again changes neither, so the
     * next reconcile reports the same conflict and every push is refused. The
     * app was telling people to do the one thing that could not work, for ever.
     *
     * Now the two documents are carried out to a screen that can show them.
     */
    const clashes = []
    for (const { id } of conflicts) {
      const a = mine.find((c) => c.id === id) || null
      const b = theirs.find((c) => c.id === id) || null

      /**
       * The one case the app is allowed to settle by itself.
       *
       * Both copies moved, and they moved to the same place — two devices that
       * made the same edit, or a dirty flag set by a save that changed nothing.
       * There is no choice to offer, so offering one would be diligence
       * performed rather than exercised. Provably lossless: the documents are
       * equal, so taking either loses none of the other.
       */
      if (a && b && sameInSubstance(a, b)) {
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
      if (a && b && sameInSubstance(a, b)) {
        rememberVersion(id, b.version)
        markDirty(id, false)
        continue
      }
      clashes.push({ kind: 'arsenal', id, mine: a, theirs: b })
    }

    const trouble = pullFailure || failure
    setState({
      status: trouble ? 'failed' : clashes.length > 0 ? 'conflicted' : 'synced',
      pushed,
      pulled,
      held,
      adopted: adopted.length,
      conflicts: clashes,
      error: trouble,
      // Always stamped, success or failure. `settled` is derived from `at`, so
      // leaving it null on a bad reconcile is what hangs the shelf.
      at: Date.now(),
    })
    if (pulled > 0) onChanged?.()
  }, [onChanged, user, available])

  useEffect(() => {
    if (!available || !user) {
      reconciledFor.current = null
      // Always 'offline', never left at 'idle'. Signed out with data only in
      // this browser is precisely the state that needs saying out loud, and an
      // early version skipped the update from 'idle' to avoid a pointless
      // render — which silenced the warning on the one load where it mattered.
      setState((s) => (s.status === 'offline' ? s : { ...s, status: 'offline' }))
      return
    }
    if (reconciledFor.current === user.id) return
    reconciledFor.current = user.id
    reconcile()
  }, [user, available, reconcile])

  /**
   * Mirrors one campaign upward. Fire-and-forget by design: the local write has
   * already happened and is what the app is reading, so a failed mirror is a
   * status line, never a lost edit or a blocked interaction.
   */
  const mirror = useCallback((campaign) => {
    // The one that would actually do the damage — see PUSH_DISABLED. `mirror`
    // fires on every local save, so without this guard the first keystroke
    // after the cutover would push an arsenal-less campaign over a player's
    // only server copy.
    if (PUSH_DISABLED) return
    if (!user || !available || !campaign?.id) return
    remote.put(campaign, { baseVersion: knownVersion(campaign.id) })
      .then(({ saved }) => {
        if (!alive.current) return
        // Move the base version forward, or the next save conflicts with the
        // copy this very request just created.
        rememberVersion(campaign.id, saved?.version)
        markDirty(campaign.id, false)
        setState((s) => ({ ...s, status: 'synced', error: null, at: Date.now() }))
      })
      .catch((err) => {
        if (!alive.current) return
        /**
         * A conflict is not a failure, and must not be retried.
         *
         * The server refused because this copy is behind — which is the guard
         * that exists precisely because blindly retrying is what destroyed a
         * leader portrait. So the local edit stays exactly where it is, and a
         * full reconcile decides what happens to it: `planSync` compares
         * `updatedAt` and either pushes this copy forward or pulls the newer
         * one down. Nothing here overwrites anything.
         */
        if (err.stale) {
          setState((s) => ({
            ...s,
            status: 'syncing',
            error: null,
          }))
          reconcile()
          return
        }
        setState((s) => ({ ...s, status: 'failed', error: err.message }))
      })
  }, [user, available, reconcile])

  /**
   * Settle one conflict the way the owner chose.
   *
   * The choice is always theirs — see `shape/compare.js` for why this is one
   * person's decision about their own two devices and never a negotiation
   * between players. Nothing here picks a winner; it carries out a pick.
   *
   * The loser is never destroyed: `both` keeps it on the shelf outright, and
   * `download` hands over a file containing both sides before anything is
   * chosen at all.
   */
  const resolve = useCallback((id, choice) => {
    const clash = state.conflicts.find((c) => c.id === id)
    if (!clash) return

    const out = resolveConflict(clash, {
      saveDoc: (kind, doc, opts) => (kind === 'arsenal' ? saveArsenal(doc, opts) : saveCampaign(doc, opts)),
      rememberVersion,
      markDirty,
    })

    // `mine` means "I have seen theirs and I am replacing it", so the push is
    // now legitimate rather than blind and goes through the ordinary gate.
    // Pushing is off, so 'keep mine' simply keeps it: the copy stays dirty and
    // goes up when step F enables pushes. `mirror` is a no-op meanwhile.
    if (out.resolved === 'mine') mirror(clash.mine)

    setState((s) => ({
      ...s,
      conflicts: s.conflicts.filter((c) => c.id !== id),
      status: s.conflicts.length <= 1 ? 'synced' : s.status,
    }))
    onChanged?.()
    return out
  }, [state.conflicts, onChanged, mirror])

  /** Both sides, as a file, before choosing. The universal escape hatch (§8). */
  const downloadConflict = useCallback((id) => {
    const clash = state.conflicts.find((c) => c.id === id)
    if (!clash) return
    const name = clash.mine?.name || clash.mine?.leader?.name || clash.id
    exportJSON(conflictExport(clash), `${String(name).toLowerCase().replace(/\s+/g, '-')}-conflict.json`)
  }, [state.conflicts])

  /**
   * The same for an arsenal, and deliberately a near-copy of `mirror` rather
   * than one function with a `kind` argument.
   *
   * The plan forbids copy-pasting the *decision* logic — `planSync`, the version
   * facts — and this is not that. This is the transport, where the two differ
   * in which endpoint they call and which storage function writes the answer,
   * and a discriminator threaded through would make both harder to read for no
   * shared logic worth sharing.
   */
  const mirrorArsenal = useCallback((arsenal) => {
    if (PUSH_DISABLED) return
    if (!user || !available || !arsenal?.id) return
    remoteArsenals.put(arsenal, { baseVersion: knownVersion(arsenal.id) })
      .then(({ saved }) => {
        if (!alive.current) return
        rememberVersion(arsenal.id, saved?.version)
        markDirty(arsenal.id, false)
        setState((s) => ({ ...s, status: 'synced', error: null, at: Date.now() }))
      })
      .catch((err) => {
        if (!alive.current) return
        // A conflict is not a failure and must not be retried — the local edit
        // stays exactly where it is and a full reconcile decides what happens
        // to it. Blindly retrying is what destroyed a leader portrait.
        if (err.stale) {
          setState((s) => ({ ...s, status: 'syncing', error: null }))
          reconcile()
          return
        }
        setState((s) => ({ ...s, status: 'failed', error: err.message }))
      })
  }, [user, available, reconcile])

  const forgetArsenal = useCallback((id) => {
    if (PUSH_DISABLED) return
    if (!user || !available) return
    remoteArsenals.remove(id).catch(() => {
      // An arsenal discarded locally but still on the server comes back on the
      // next reconcile. Survivable, and better than blocking the delete.
    })
  }, [user, available])

  const forget = useCallback((id) => {
    if (PUSH_DISABLED) return
    if (!user || !available) return
    remote.remove(id).catch(() => {
      // A campaign discarded locally but still on the server will come back on
      // the next reconcile. Say so rather than pretending it went.
      if (alive.current) {
        setState((s) => ({ ...s, status: 'failed', error: 'Removed here, but not on the server yet.' }))
      }
    })
  }, [user, available])

  /**
   * Has the shelf finished arriving?
   *
   * Derived from `at` — the timestamp of the last completed reconcile —
   * rather than from `status`. On the render where auth resolves, the sync
   * effect has only just called `reconcile()`, so `status` is still whatever it
   * was before and reads as settled. `at` is null until a reconcile has
   * actually finished, which is the question being asked.
   *
   * Signed out settles immediately: there is no shelf coming.
   */
  const settled = !user || !available ? true : state.at !== null && state.status !== 'syncing'

  /**
   * Do we actually **know** what is on this account's shelf?
   *
   * Different from `settled`, and the difference is the whole point. `settled`
   * answers "has the reconcile stopped running", which is now true even when it
   * stopped by failing — deliberately, because the alternative is the spinner
   * that never resolves. But "the sync failed" and "this account has no
   * campaigns" are not the same answer, and only one of them means it is safe
   * to act as though the shelf is empty.
   *
   * Caught while reproducing the stale-closure bug: with the pull failing but
   * settling, the app read an empty shelf as a new player and **invented a
   * blank leader**, dropping straight into the creation wizard while a real
   * campaign sat on the server. Inventing data because a network call failed is
   * a worse outcome than showing nothing.
   */
  const knowsShelf = settled && state.status !== 'failed'

  return {
    ...state, settled, knowsShelf, reconcile,
    mirror, forget, mirrorArsenal, forgetArsenal,
    resolve, downloadConflict,
  }
}
