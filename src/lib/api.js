const BASE = import.meta?.env?.VITE_REGISTRY_BASE || '/api/v1'
const MODE = import.meta?.env?.VITE_REGISTRY_MODE || 'remote'

/** The register caps a page at 100 however much more you ask for. */
const FACTION_PAGE_SIZE = 100
/** A faction is one or two pages; anything past this is a paginator misbehaving. */
const FACTION_PAGE_CAP = 20

export class RegistryError extends Error {
  constructor(message, { status, path } = {}) {
    super(message)
    this.name = 'RegistryError'
    this.status = status
    this.path = path
  }
}

async function request(path, { signal } = {}) {
  let res
  try {
    res = await fetch(BASE.replace(/\/$/, '') + path, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (cause) {
    throw new RegistryError(
      'Could not reach the register. In development this goes through the Vite proxy — check that the dev server is running and VITE_REGISTRY_UPSTREAM is correct.',
      { path }
    )
  }
  if (!res.ok) {
    throw new RegistryError(`Register returned ${res.status}.`, { status: res.status, path })
  }
  return res.json()
}

/**
 * Runs jobs a few at a time with a pause between batches.
 *
 * The register is a donation-funded community project. Firing several hundred
 * parallel requests at it is how community tools get their access revoked, so
 * this deliberately runs slower than it could.
 */
export async function throttledMap(items, worker, { concurrency = 3, gapMs = 150, onProgress } = {}) {
  const results = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    results.push(...(await Promise.all(batch.map(worker))))
    onProgress?.(Math.min(i + concurrency, items.length), items.length)
    if (i + concurrency < items.length) {
      await new Promise((resolve) => setTimeout(resolve, gapMs))
    }
  }
  return results
}

export const registry = {
  mode: MODE,

  searchKeywords: (term, opts) =>
    request(`/keywords?search=${encodeURIComponent(term)}`, opts).then((j) => j.data || []),

  /** One call returns every character sharing a keyword — the reason no bulk seed is needed. */
  keyword: (slug, opts) =>
    request(`/keywords/${encodeURIComponent(slug)}`, opts).then((j) => j.data),

  character: (slug, opts) =>
    request(`/characters/${encodeURIComponent(slug)}`, opts).then((j) => j.data),

  /**
   * Every character in a faction, across pages.
   *
   * Two things about this endpoint that cost time to learn:
   *
   * - `per_page` must be sent on **every** page. Omit it on page 2 and the
   *   server re-serves the tail of page 1 instead of erroring, so a naive
   *   loop silently collects duplicates and misses the real remainder.
   * - Unlike `/keywords/{slug}`, these index records DO carry `keywords` and
   *   `characteristics`. That is what makes Versatile detection possible
   *   without a detail request per model.
   *
   * Deduplicated by slug regardless, and page-capped, because a paginator
   * that repeats itself is a paginator that could fail to terminate.
   */
  charactersByFaction: async (factionSlug, { signal, onProgress } = {}) => {
    const collected = new Map()
    let page = 1
    let lastPage = 1

    while (page <= lastPage && page <= FACTION_PAGE_CAP) {
      const json = await request(
        `/characters?faction=${encodeURIComponent(factionSlug)}&per_page=${FACTION_PAGE_SIZE}&page=${page}`,
        { signal }
      )
      for (const record of json.data || []) {
        if (!collected.has(record.slug)) collected.set(record.slug, record)
      }
      lastPage = json.meta?.last_page || 1
      onProgress?.(page, Math.min(lastPage, FACTION_PAGE_CAP))
      page += 1
      if (page <= lastPage && page <= FACTION_PAGE_CAP) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }

    return [...collected.values()]
  },

  factions: (opts) => request('/factions', opts).then((j) => j.data || []),

  strategies: (opts) => request('/strategies', opts).then((j) => j.data || []),

  schemes: (opts) => request('/schemes', opts).then((j) => j.data || []),
}

/**
 * Reads the seeded file from public/ instead of the network.
 *
 * Reached when `VITE_REGISTRY_MODE=local`. That flag was documented in
 * `.env.example` and wired to nothing for eleven versions, so `npm run seed`
 * wrote a file the app could not read (audit L2). `useRoster` consults it now.
 *
 * The payload is `{ generatedAt, source, count, models }`, and the models are
 * register records with their descriptions stripped — the same shape
 * `toIndexedModel` takes from the network, which is why this needs no
 * translation layer.
 */
let localRegister = null
export async function loadLocalRegister() {
  if (localRegister) return localRegister
  const res = await fetch('/register.json')
  if (!res.ok) {
    throw new RegistryError('No seeded register found. Run `npm run seed` first, or set VITE_REGISTRY_MODE=remote.')
  }
  localRegister = await res.json()
  return localRegister
}
