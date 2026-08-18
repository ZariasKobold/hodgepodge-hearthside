import { useState, useCallback, useRef } from 'react'
import { registry, throttledMap, RegistryError } from '../lib/api.js'
import { toIndexedModel, isSelectionSource } from '../lib/indexing.js'
import { save, load } from '../lib/storage.js'

/**
 * Loads only the models that could ever matter: the two chosen keywords.
 *
 * A full pull is several hundred detail requests. Once a player picks their
 * keywords the answer is usually a dozen or two models, so this fetches per
 * keyword and caches the result. Nobody waits for a bulk seed, and the
 * register gets a fraction of the traffic.
 */
export function useRoster() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const loadKeywords = useCallback(async (keywords) => {
    const wanted = keywords.filter(Boolean)
    if (wanted.length === 0) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setProgress(null)

    try {
      const collected = new Map()

      for (const keyword of wanted) {
        const cacheKey = `roster:${keyword}`
        const cached = load(cacheKey)
        if (cached) {
          cached.forEach((m) => collected.set(m.slug, m))
          continue
        }

        const data = await registry.keyword(keyword, { signal: controller.signal })
        let roster = (data.characters || []).map(toIndexedModel).filter(isSelectionSource)

        // The keyword endpoint may return thin records without actions.
        const thin = roster.filter((m) => !m.hasDetail)
        if (thin.length > 0) {
          const filled = await throttledMap(
            thin,
            async (m) => {
              try {
                return toIndexedModel(await registry.character(m.slug, { signal: controller.signal }))
              } catch {
                return m // keep the thin record rather than losing the model
              }
            },
            {
              onProgress: (done, total) => setProgress({ keyword, done, total }),
            }
          )
          const byslug = new Map(filled.map((m) => [m.slug, m]))
          roster = roster.map((m) => byslug.get(m.slug) || m)
        }

        save(cacheKey, roster)
        roster.forEach((m) => collected.set(m.slug, m))
      }

      setModels([...collected.values()])
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err instanceof RegistryError ? err.message : String(err.message || err))
    } finally {
      setLoading(false)
      setProgress(null)
    }
  }, [])

  const addManual = useCallback((model) => {
    setModels((prev) => [...prev, model])
  }, [])

  return { models, loading, progress, error, loadKeywords, addManual }
}
