import { useState, useEffect, useCallback } from 'react'
import { forgetCards } from '../lib/rules.js'
import { decideSession, rememberUser, rememberedUser, forgetUser } from '../lib/session.js'

/**
 * Who's signed in, if anyone — and who was signed in, when nobody can be asked.
 *
 * Signed out is a normal *state* rather than an error, but it is not a usable
 * one: play is gated behind an account (v0.4.8, CLAUDE.md §12).
 *
 * **A successful sign-in is remembered on the device (v0.15.0).** When the
 * backend cannot be reached the remembered session stands in for it, so an
 * installed app opens and works on a train instead of showing "Sign-in is
 * unreachable" over twelve weeks of local campaigns. `available` stays false
 * throughout — that is what keeps `useSync` from pushing into the void and
 * what makes the shelf say plainly where the data currently is.
 *
 * Three states, and the middle one is new:
 *
 *   available, user      signed in, everything works
 *   unavailable, user    working offline against a remembered session; local
 *                        edits are kept and pushed on the next reconcile
 *   unavailable, none    this browser has never seen anyone sign in — the gate
 *                        stands, exactly as before
 *
 * The decision lives in `decideSession` so it can be tested rather than
 * described. The distinction it turns on: an answer of "nobody is signed in"
 * is authoritative and clears the remembered session; *no answer* is what the
 * fallback is for.
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)
  const [offline, setOffline] = useState(false)

  const refresh = useCallback(async () => {
    let reachable = true
    let serverUser = null
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      serverUser = (await res.json()).user
    } catch {
      // No backend: `npm run dev`, an outage, or no connection at all.
      reachable = false
    }

    const next = decideSession({ reachable, serverUser, remembered: rememberedUser() })

    // Only a reachable backend may change what is remembered. Signing out is a
    // real answer and clears it; being unable to ask changes nothing.
    if (reachable) {
      if (next.user) rememberUser(next.user)
      else forgetUser()
    }

    setUser(next.user)
    setAvailable(next.available)
    setOffline(next.offline)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  /**
   * Try again when the machine says the network is back.
   *
   * `useSync` reconciles when `available` flips to true, so this event is what
   * turns "the wifi came back" into "everything you did offline is now on your
   * account".
   */
  useEffect(() => {
    const onOnline = () => refresh()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [refresh])

  const signIn = useCallback((provider = 'discord') => {
    window.location.href = `/api/auth/${provider}`
  }, [])

  const signOut = useCallback(async () => {
    // The local half must happen whether or not the request does. Offline this
    // used to throw before reaching `setUser`, leaving the session on screen
    // and the remembered copy on disk — sign-out that only works with a signal
    // is not sign-out.
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch { /* the cookie expires on its own; the local clear is what matters */ }
    forgetUser()
    setUser(null)
    setOffline(false)
    // Drop the rules text held in memory for their models (audit L4).
    forgetCards()
  }, [])

  return { user, loading, available, offline, signIn, signOut, refresh }
}
