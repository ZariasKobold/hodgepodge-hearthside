import { useState, useEffect, useCallback } from 'react'
import { forgetCards } from '../lib/rules.js'

/**
 * Who's signed in, if anyone.
 *
 * Signed out is a normal *state* — this hook reports it rather than treating it
 * as an error — but it is no longer a usable one. **Play is gated behind an
 * account** (v0.4.8, CLAUDE.md §12); `SignInGate` closes the wizard to anyone
 * not signed in. This header claimed the reverse until the v0.5.2 audit (M7).
 *
 * The concern that motivated the old rule is still live and is met elsewhere:
 * Wyrd's permission is revocable, so the gate keeps the JSON export reachable
 * from behind it, and the shelf can import one back.
 *
 * `available: false` means the accounts backend is unreachable, which is every
 * `npm run dev` session. That is distinct from being signed out, and the gate
 * says so rather than offering a button that cannot work.
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const { user } = await res.json()
      setUser(user)
      setAvailable(true)
    } catch {
      // No backend (local dev without wrangler, or the Function is down).
      // Degrade to signed-out rather than blocking the app.
      setUser(null)
      setAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const signIn = useCallback((provider = 'discord') => {
    window.location.href = `/api/auth/${provider}`
  }, [])

  const signOut = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    setUser(null)
    // Drop the rules text held in memory for their models. forgetCards has
    // documented itself as being "for sign-out" since it was written and was
    // never called from one (audit L4) — which mattered more once H1 showed
    // sign-out was cleaning up nothing at all.
    forgetCards()
  }, [])

  return { user, loading, available, signIn, signOut, refresh }
}
