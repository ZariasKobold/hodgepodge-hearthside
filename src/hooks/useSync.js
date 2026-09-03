import { useState, useEffect, useCallback, useRef } from 'react'
import { remote, planSync, stampOwner, SyncError } from '../lib/remote.js'
import {
  saveCampaign, loadCampaign, campaignIds, knownVersion, rememberVersion,
  isDirty, markDirty,
} from '../lib/storage.js'
import {
  belongsTo,
} from '../lib/shape/ownership.js'
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
 * ⚠ SYNC IS OFF FOR THE v3 CUTOVER, AND MUST STAY OFF UNTIL STEP 5.
 *
 * `docs/data-model-v3.md`, step 3: *"The UI, against local storage only, with
 * sync switched off."* This constant is that switch, and the reason is specific
 * rather than cautious.
 *
 * The local shelf is now v3: a campaign is a table with `participants`, and the
 * leader, models, scrip and injuries live in a **separate arsenal document**.
 * The server still holds v2 documents, where all of that was nested inside the
 * campaign, and `useSync` only knows how to push campaigns. So a single
 * successful push would replace a player's server copy with a campaign that has
 * no arsenal in it at all, and their arsenal — the only remaining copy —
 * would never be sent. Another device pulling that would find a leader-shaped
 * hole.
 *
 * That is not a hypothetical: it is the same class of loss as v0.18.4, and this
 * time it would be five other people rather than one.
 *
 * Turning it back on is step 5, and step 5 is **not** "delete this line". It is
 * generalising `knownVersion` / `markDirty` / `planSync` over a `kind` once,
 * adding `version` to `arsenals` in migration 0005, and teaching the server both
 * shapes. Until all of that exists, this stays true.
 */
export const SYNC_DISABLED = true

export function useSync({ user, available, onChanged }) {
  const [state, setState] = useState({
    status: 'idle',      // idle | syncing | synced | failed | offline
    pushed: 0,
    pulled: 0,
    adopted: 0,
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
    // See SYNC_DISABLED. Refused here rather than at the call sites, so there is
    // exactly one place that decides and nothing can route around it.
    if (SYNC_DISABLED) {
      setState({ status: 'paused', pushed: 0, pulled: 0, adopted: 0, error: null, at: Date.now() })
      return
    }
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

    let theirs
    try {
      theirs = await remote.list()
    } catch (err) {
      if (!alive.current) return
      setState({
        status: err instanceof SyncError && err.signedOut ? 'offline' : 'failed',
        pushed: 0, pulled: 0, adopted: 0,
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
    for (const campaign of pull) {
      try {
        saveCampaign(stampOwner(campaign, user.id), { keepTimestamp: true })
        // The version we were just handed is, by definition, the version this
        // copy is now based on — and this copy is the account's own, so it
        // owes the account nothing.
        rememberVersion(campaign.id, campaign.version)
        markDirty(campaign.id, false)
        pulled += 1
      } catch (err) {
        pullFailure = pullFailure || err.message
      }
    }

    let pushed = 0
    let failure = null
    for (const campaign of push) {
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
    const clash = conflicts.length > 0
      ? `${conflicts.length === 1 ? 'A campaign has' : `${conflicts.length} campaigns have`} been edited both here and on another device. Nothing was overwritten; open it on one device and save to settle it.`
      : null
    const trouble = pullFailure || failure || clash
    setState({
      status: trouble ? 'failed' : 'synced',
      pushed,
      pulled,
      adopted: adopted.length,
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
    // The one that would actually do the damage — see SYNC_DISABLED. `mirror`
    // fires on every local save, so without this guard the first keystroke
    // after the cutover would push an arsenal-less campaign over a player's
    // only server copy.
    if (SYNC_DISABLED) return
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

  const forget = useCallback((id) => {
    if (SYNC_DISABLED) return
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

  return { ...state, settled, knowsShelf, reconcile, mirror, forget }
}
