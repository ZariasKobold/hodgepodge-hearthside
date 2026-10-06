import { useState, useEffect, useCallback, useRef } from 'react'
import * as api from '../lib/sharedCrew.js'

/** How often an open Crew tab asks whether the other side has revealed. */
const POLL_MS = 10_000

/**
 * The shared hiring sessions at one table, kept fresh while the Crew tab is
 * open.
 *
 * Polled, not pushed. Pages Functions have no sockets without Durable Objects,
 * and the thing being waited for, "have they revealed yet", is a human
 * decision measured in minutes. One small query every ten seconds, only while
 * the tab is open and visible, is far inside D1's free plan.
 *
 * Never cached locally (the same rule as membership): a stale answer to "has
 * my opponent revealed" is worse than none. Every failure is survivable: the
 * local crew is untouched, and the screen says the shared half is unreachable.
 */
export function useSharedCrew({ tableId, enabled }) {
  const [sessions, setSessions] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const refresh = useCallback(async () => {
    if (!enabled || !tableId) return
    try {
      const { encounters } = await api.listSessions(tableId)
      if (!alive.current) return
      setSessions(encounters || [])
      setError(null)
    } catch (err) {
      if (alive.current) setError(err.message)
    }
  }, [enabled, tableId])

  useEffect(() => {
    if (!enabled || !tableId) { setSessions([]); return undefined }
    refresh()
    const tick = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') refresh()
    }, POLL_MS)
    // A hidden tab skips its polls, so coming back to it must not show an
    // answer up to ten seconds old: the opponent may have revealed meanwhile.
    const onShow = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onShow)
    return () => {
      clearInterval(tick)
      document.removeEventListener('visibilitychange', onShow)
    }
  }, [enabled, tableId, refresh])

  /** Run one action, then re-read. Returns its result, or throws for the caller. */
  const act = useCallback(async (fn) => {
    setBusy(true)
    try {
      const out = await fn()
      await refresh()
      return out
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [refresh])

  return {
    sessions, error, busy, refresh,
    available: Boolean(enabled && tableId),
    open: (body) => act(() => api.openSession({ tableId, ...body })),
    reveal: (id, crew) => act(() => api.reveal(id, crew)),
    close: (id) => act(() => api.closeSession(id)),
  }
}
