import { useEffect, useState } from 'react'
import { fetchScenarioText, cachedStrategy, cachedScheme } from '../lib/rules.js'
import { RegistryError } from '../lib/api.js'

/**
 * Strategy and scheme text for the encounter setup, read live (§4).
 * Two requests for the whole season, once per tab. Failure is a note, never a
 * wall: the names are in `data/gainingGrounds.js` and setup works without it.
 */
export function useScenarioText(enabled = true) {
  const [state, setState] = useState({ loading: false, error: null, ready: false })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    fetchScenarioText()
      .then(() => { if (alive) setState({ loading: false, error: null, ready: true }) })
      .catch((err) => {
        if (alive) {
          setState({
            loading: false,
            ready: false,
            error: err instanceof RegistryError ? err.message : String(err?.message || err),
          })
        }
      })
    return () => { alive = false }
  }, [enabled])

  return { ...state, strategy: cachedStrategy, scheme: cachedScheme }
}
