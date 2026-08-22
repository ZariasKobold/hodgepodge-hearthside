import { useState, useCallback, useRef, useEffect } from 'react'
import { fetchCard, cachedCard, forgetCards } from '../lib/rules.js'
import { RegistryError } from '../lib/api.js'

/**
 * React's view of the live rules-text cache.
 *
 * The cache itself lives in `rules.js` and is memory-only by design (§4). This
 * hook exists only to turn "a card arrived" into a re-render, so the component
 * tree never holds the text either — it reads through on every paint.
 *
 * Two entry points, because two very different callers need it:
 *
 *   ensure(slug)   one model, on demand. Hover fires this constantly, so it is
 *                  idempotent and deduplicated all the way down.
 *   ensureAll()    a known set, on a button. Throttled through the same batch
 *                  helper the roster uses, for the same reason: the register is
 *                  donation-funded and a crew is a dozen requests at once.
 */
export function useRules() {
  // Bumped whenever a card lands. The cards themselves are read from rules.js.
  const [, bump] = useState(0)
  const [errors, setErrors] = useState({})
  const [pending, setPending] = useState(() => new Set())
  const [batch, setBatch] = useState({ loading: false, done: 0, total: 0, error: null })

  const asked = useRef(new Set())
  const alive = useRef(true)
  useEffect(() => {
    // Set on the way in as well as cleared on the way out. StrictMode mounts,
    // tears down and remounts in development; a cleanup-only flag would stay
    // false after that second pass and silently discard every response.
    alive.current = true
    return () => { alive.current = false }
  }, [])

  /**
   * Forgets a recorded failure. `RulesState` consults the error before the
   * card, so an error left behind by an earlier blip would go on hiding text
   * that has since loaded perfectly well (audit M2).
   */
  const clearError = useCallback((slug) => {
    setErrors((prev) => {
      if (!(slug in prev)) return prev
      const next = { ...prev }
      delete next[slug]
      return next
    })
  }, [])

  const track = useCallback((slug, on) => {
    setPending((prev) => {
      if (on === prev.has(slug)) return prev
      const next = new Set(prev)
      if (on) next.add(slug)
      else next.delete(slug)
      return next
    })
  }, [])

  const ensure = useCallback((slug) => {
    if (!slug || cachedCard(slug) || asked.current.has(slug)) return
    asked.current.add(slug)
    track(slug, true)

    fetchCard(slug)
      .then(() => {
        if (!alive.current) return
        track(slug, false)
        clearError(slug)
        bump((n) => n + 1)
      })
      .catch((err) => {
        if (!alive.current) return
        // Let it be retried — a register blip should not poison the slug.
        asked.current.delete(slug)
        track(slug, false)
        setErrors((prev) => ({
          ...prev,
          [slug]: err instanceof RegistryError ? err.message : String(err.message || err),
        }))
      })
  }, [track, clearError])

  const ensureAll = useCallback(async (slugs) => {
    const wanted = [...new Set(slugs.filter(Boolean))].filter((s) => !cachedCard(s))
    if (wanted.length === 0) {
      setBatch({ loading: false, done: 0, total: 0, error: null })
      bump((n) => n + 1)
      return
    }

    setBatch({ loading: true, done: 0, total: wanted.length, error: null })

    let failure = null
    let done = 0
    // Sequential with a short gap rather than parallel: an arsenal is small and
    // being a good guest matters more than shaving a second off the wait.
    for (const slug of wanted) {
      try {
        await fetchCard(slug)
        clearError(slug)
      } catch (err) {
        failure = err instanceof RegistryError ? err.message : String(err.message || err)
        setErrors((prev) => ({ ...prev, [slug]: failure }))
      }
      done += 1
      if (!alive.current) return
      setBatch((b) => ({ ...b, done }))
      bump((n) => n + 1)
      if (done < wanted.length) await new Promise((r) => setTimeout(r, 120))
    }

    if (!alive.current) return
    setBatch({ loading: false, done, total: wanted.length, error: failure })
  }, [clearError])

  const forget = useCallback(() => {
    forgetCards()
    asked.current.clear()
    setErrors({})
    bump((n) => n + 1)
  }, [])

  return {
    card: cachedCard,
    isPending: (slug) => pending.has(slug),
    errorFor: (slug) => errors[slug] || null,
    ensure,
    ensureAll,
    batch,
    forget,
  }
}
