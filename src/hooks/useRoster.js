import { useState, useCallback, useRef } from 'react'
import { registry, throttledMap, RegistryError, loadLocalRegister } from '../lib/api.js'
import { toIndexedModel, isSelectionSource, isVersatile } from '../lib/indexing.js'
import { registerFaction } from '../data/factions.js'
import { save, load } from '../lib/storage.js'

/**
 * Loads only the models that could ever matter.
 *
 * Two pools, fetched together because they are wanted together:
 *
 *   keywords  the two the leader declared. One call per keyword returns every
 *             character sharing it, which is why no bulk seed is needed.
 *   versatile the declared faction's Versatile models. These can be hired by
 *             any crew of the faction, so they belong in the arsenal picker
 *             even though they share no keyword. Two calls for a whole faction,
 *             because the faction index carries `characteristics` and the
 *             keyword index does not.
 *
 * Both are cached. The register is donation-funded and game night doesn't wait.
 */
export function useRoster() {
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

  const load_ = useCallback(async ({ keywords = [], faction = null } = {}) => {
    const wanted = keywords.filter(Boolean)
    if (wanted.length === 0 && !faction) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setProgress(null)

    /**
     * The seeded file, when asked for it.
     *
     * One read serves both pools, so there is no network at all — which is the
     * point: the register is donation-funded, and working on the wizard should
     * not mean hammering it. Everything after this is the same indexing the
     * network path uses.
     */
    if (registry.mode === 'local') {
      try {
        const { models: records = [] } = await loadLocalRegister()
        const indexed = records.map(toIndexedModel)
        const collected = new Map()

        for (const keyword of wanted) {
          indexed
            .filter((m) => m.keywords.includes(keyword) && isSelectionSource(m))
            .forEach((m) => collected.set(m.slug, m))
        }
        if (faction) {
          const registerSlug = registerFaction(faction)
          indexed
            .filter((m) => m.faction === registerSlug && isVersatile(m) && isSelectionSource(m))
            .forEach((m) => { if (!collected.has(m.slug)) collected.set(m.slug, m) })
        }

        setModels([...collected.values()])
      } catch (err) {
        setError(err instanceof RegistryError ? err.message : String(err.message || err))
      } finally {
        setLoading(false)
        setProgress(null)
      }
      return
    }

    try {
      const collected = new Map()

      for (const keyword of wanted) {
        // The version in the key is deliberately NOT bumped for the v0.16.0
        // totem change. Old caches were built by an `isSelectionSource` that
        // already dropped every totem — via the cost test, which catches them
        // all — so no cached roster contains one. Bumping would re-fetch a
        // donation-funded register for a result identical to what is on disk.
        const cacheKey = `roster:2:${keyword}`
        const cached = load(cacheKey)
        if (cached) {
          cached.forEach((m) => collected.set(m.slug, m))
          continue
        }

        const data = await registry.keyword(keyword, { signal: controller.signal })
        const indexed = (data.characters || []).map(toIndexedModel)
        let roster = indexed.filter(isSelectionSource)

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

        // The detail refill is also where `characteristics` arrives — the
        // keyword index does not carry it — so a totem that slipped past the
        // thin record's cost test is caught here rather than reaching the
        // picker.
        roster = roster.filter(isSelectionSource)

        save(cacheKey, roster)
        roster.forEach((m) => collected.set(m.slug, m))
      }

      if (faction) {
        const versatile = await loadVersatileFor(faction, controller.signal, setProgress)
        // Keyword records win: they have been through the detail fetch and so
        // carry actions, which the faction index never does.
        versatile.forEach((m) => {
          if (!collected.has(m.slug)) collected.set(m.slug, m)
        })
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

  return { models, loading, progress, error, load: load_ }
}

/**
 * The faction's Versatile models, indexed and cached.
 *
 * Kept out of the hook body so the keyword path stays readable. Returns an
 * empty list for an unmapped faction rather than querying with a slug the
 * register would answer with zero rows.
 */
async function loadVersatileFor(faction, signal, setProgress) {
  const cacheKey = `versatile:2:${faction}`
  const cached = load(cacheKey)
  if (cached) return cached

  const registerSlug = registerFaction(faction)
  if (!registerSlug) return []

  const records = await registry.charactersByFaction(registerSlug, {
    signal,
    onProgress: (done, total) => setProgress({ keyword: 'versatile models', done, total }),
  })

  const indexed = records.map(toIndexedModel)
  const roster = indexed.filter((m) => isVersatile(m) && isSelectionSource(m))

  save(cacheKey, roster)
  return roster
}
