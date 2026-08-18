const BASE = import.meta?.env?.VITE_REGISTRY_BASE || '/api/v1'
const MODE = import.meta?.env?.VITE_REGISTRY_MODE || 'remote'

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

  factions: (opts) => request('/factions', opts).then((j) => j.data || []),

  strategies: (opts) => request('/strategies', opts).then((j) => j.data || []),

  schemes: (opts) => request('/schemes', opts).then((j) => j.data || []),
}

/** Reads a seeded file from public/ instead of the network. */
export async function loadLocalRegister() {
  const res = await fetch('/register.json')
  if (!res.ok) throw new RegistryError('No seeded register found. Run `npm run seed` first.')
  return res.json()
}
