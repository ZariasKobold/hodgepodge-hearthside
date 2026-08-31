import { useState, useEffect, useCallback, useRef } from 'react'
import { remote, planSync, SyncError } from '../lib/remote.js'
import { saveCampaign, loadCampaign, campaignIds } from '../lib/storage.js'
import { belongsTo } from '../lib/campaignShape.js'

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

  const reconcile = useCallback(async () => {
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

    const { pull, push, adopted } = planSync(mine, theirs)

    // Pull first. If the push half fails, the browser has still gained whatever
    // the account held, and nothing local was thrown away to get it.
    // Anything the server hands back is this account's by definition — it was
    // fetched with their session — so stamp it on the way in.
    for (const campaign of pull) {
      saveCampaign({ ...campaign, ownerUserId: user.id }, { keepTimestamp: true })
    }

    let pushed = 0
    let failure = null
    for (const campaign of push) {
      try {
        await remote.put(campaign)
        // Claimed now that the account has actually accepted it.
        saveCampaign({ ...campaign, ownerUserId: user.id }, { keepTimestamp: true })
        pushed += 1
      } catch (err) {
        // Carry on rather than stop. An earlier version broke out of this loop
        // on the first failure, so a single unpushable campaign kept every
        // campaign behind it from ever reaching the account (audit v0.11.0, H1).
        failure = failure || err.message
      }
    }

    if (!alive.current) return
    setState({
      status: failure ? 'failed' : 'synced',
      pushed,
      pulled: pull.length,
      adopted: adopted.length,
      error: failure,
      at: Date.now(),
    })
    if (pull.length > 0) onChanged?.()
  }, [onChanged])

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
    if (!user || !available || !campaign?.id) return
    remote.put(campaign)
      .then(() => alive.current && setState((s) => ({ ...s, status: 'synced', error: null, at: Date.now() })))
      .catch((err) => alive.current && setState((s) => ({ ...s, status: 'failed', error: err.message })))
  }, [user, available])

  const forget = useCallback((id) => {
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

  return { ...state, settled, reconcile, mirror, forget }
}
