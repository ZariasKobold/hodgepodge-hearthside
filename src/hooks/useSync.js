import { useState, useEffect, useCallback, useRef } from 'react'
import { remote, remoteArsenals } from '../lib/remote.js'
import { runReconcile } from '../lib/reconcile.js'
import {
  saveCampaign, loadCampaign, campaignIds, knownVersion, rememberVersion,
  isDirty, markDirty, saveArsenal, loadArsenal, arsenalIds, removeArsenal,
} from '../lib/storage.js'
import {
  belongsTo,
} from '../lib/shape/ownership.js'
import { resolveConflict, conflictExport } from '../lib/shelf.js'
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
     * The work itself lives in `src/lib/reconcile.js`.
     *
     * It was moved there so it could be tested: §6 keeps rules out of React,
     * and the loops below the decision were the one part of the sync path no
     * test could reach. That is exactly where v0.21.1's missing arsenal push
     * hid — see the header of that file. What is left here is what a hook is
     * for: knowing whether the component is still mounted, and turning a
     * result into state.
     */
    const result = await runReconcile({
      userId: user.id,
      pushDisabled: PUSH_DISABLED,
      storage: {
        campaignIds, loadCampaign, saveCampaign,
        arsenalIds, loadArsenal, saveArsenal,
      },
      remote: {
        listCampaigns: () => remote.list(),
        putCampaign: (doc, opts) => remote.put(doc, opts),
        listArsenals: () => remoteArsenals.list(),
        putArsenal: (doc, opts) => remoteArsenals.put(doc, opts),
      },
      versions: { knownVersion, rememberVersion, isDirty, markDirty },
    })

    if (!alive.current) return
    const { changed, ...next } = result
    setState({
      ...next,
      // Always stamped, success or failure. `settled` is derived from `at`, so
      // leaving it null on a bad reconcile is what hangs the shelf.
      at: Date.now(),
    })
    if (changed) onChanged?.()
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
