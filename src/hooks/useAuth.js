import { useState, useEffect, useCallback } from 'react'

/**
 * Who's signed in, if anyone.
 *
 * Signed out is a normal state, not an error — accounts exist for SHARING a
 * campaign, not for using the app. The whole wizard works against local
 * storage with nobody signed in, and that has to stay true: Wyrd's permission
 * is revocable, and a login wall makes people's data harder to rescue.
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
  }, [])

  return { user, loading, available, signIn, signOut, refresh }
}
