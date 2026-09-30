/**
 * The campaign book's own text, for a player who has earned the entry.
 *
 * ## Where the text lives, and why not here
 *
 * `src/data/advancements.js` and `equipment.js` hold names, values, costs and
 * page numbers — facts about *what you own*. They deliberately hold no rules
 * text (§4), and the reason is on `docs/*.pdf`'s line in `.gitignore`: *Index
 * of the Untold* is a product Wyrd sells, its copyright page permits personal
 * copies and bars distributing them, and this repository is public.
 *
 * So the text is in **D1**, loaded by hand by the owner (migration 0007,
 * `scripts/book-to-sql.mjs`), and read through `POST /api/book`, which answers
 * only for entries the caller's own arsenals actually hold. Collecting the book
 * would mean earning every advancement and buying every item across many real
 * campaign weeks — which is not a scrape. `functions/lib/bookStore.js` holds
 * that rule and is the file to read before changing any of this.
 *
 * This is the **second explicit amendment to §4**, after v0.5.0's display-only
 * exception, and by the same authority: owner decision. It is narrower than it
 * looks — no public read, no write endpoint, no entitlement without play.
 *
 * ## Two sources, on purpose
 *
 * `npm run dev` serves no Functions (§10), so `/api/book` cannot answer there.
 * A local `public/book.json` is the fallback, so the owner can see their own
 * work while building. That file is gitignored **and** `npm run build` refuses
 * to bundle it with text in it (`scripts/check-no-book-text.mjs`), because
 * everything in `public/` is served — so the fallback cannot reach production
 * even by accident.
 *
 * ## It is display-only, and must stay that way
 *
 * Held in a module-level cache that dies with the tab, like `lib/rules.js`.
 * **Never write any of this into a campaign document, the JSON export, or
 * localStorage.** D1 is the one exception now, and that is the server's copy
 * rather than a player's. Errata land on the next page load, which is the whole
 * point of not keeping it.
 */

/**
 * The books this app can show text from.
 *
 * Order is the order the gate asks in. `title` matches `book_text.title` and
 * `book_challenges.title` on the server exactly — a mismatch means the gate
 * asks about a book nothing is filed under and no text ever unlocks.
 */
export const BOOK_TITLES = ['index-of-the-untold', 'the-silent-catalogue']

/** Ask the server for a challenge, or null if this title needs none. */
export async function fetchChallenge(title) {
  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'challenge', title }),
    })
    if (!res.ok) return null
    const { challenge } = await res.json()
    return challenge || null
  } catch {
    return null
  }
}

/** Submit an answer. `{ ok }` on success, with `remaining` / `lockedUntil` otherwise. */
export async function submitAnswer(challengeId, answer) {
  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'answer', challengeId, answer }),
    })
    if (!res.ok) return { ok: false }
    return await res.json()
  } catch {
    return { ok: false }
  }
}

/** Everything fetched this session, by key. Dies with the tab. */
const cache = new Map()
/** Keys already asked about and answered for — including the empty answers. */
const asked = new Set()
let localFile = null

/**
 * The key for one advancement row.
 *
 * Table, value and name together, because none of the three is unique alone:
 * "Skill Boost" is printed three times on the attack table at different values,
 * and value 9 on the action table carries four different options. Getting this
 * wrong is how v0.22.2's name-keyed select recorded the wrong row for a year.
 *
 * **Mirrored in `functions/lib/bookStore.js`**, which cannot import this (§6).
 * If either changes, change both — a divergence means the server entitles
 * nothing and the text silently stops appearing.
 */
export function advancementKey(tableId, entry) {
  if (!tableId || !entry?.name) return null
  /**
   * `value` on a row from `data/advancements.js`, `tableValue` on one that was
   * *recorded* on a leader — the same number under two names, because v0.22.2
   * had to call it something else to sit beside the flip that won it.
   *
   * Reading only `value` looked right against the data file and found nothing
   * at all on a real record, which is where it was caught: the scaffold is
   * generated from one shape and every lookup happens against the other.
   */
  const value = entry.value ?? entry.tableValue ?? '?'
  return `advancement:${tableId}:${value}:${entry.name}`
}

/** The key for one piece of equipment. Its id is already unique. */
export function equipmentKey(id) {
  return id ? `equipment:${id}` : null
}

/** The key for one injury row. */
export function injuryKey(id) {
  return id ? `injury:${id}` : null
}

/** The dev-only local copy, read once. Absent in production by construction. */
async function readLocalFile() {
  if (localFile) return localFile
  try {
    const res = await fetch('/book.json')
    if (!res.ok) return {}
    const json = await res.json()
    localFile = json && typeof json === 'object' ? json : {}
    return localFile
  } catch {
    return {}
  }
}

/**
 * Fetch the text for these keys, skipping any already answered for.
 *
 * Resolves to the accumulated cache, so a caller can read every key it knows
 * about whether or not this particular call fetched it. An unanswered key is
 * simply absent — the server never distinguishes "not yours" from "does not
 * exist", and neither does this.
 */
export async function ensureBookText(keys = []) {
  const wanted = [...new Set(keys.filter(Boolean))].filter((k) => !asked.has(k))
  if (wanted.length === 0) return cache

  // Marked before the request rather than after: two components mounting
  // together must not both ask for the same keys.
  for (const key of wanted) asked.add(key)

  try {
    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: wanted }),
    })
    if (res.ok) {
      const text = await res.json()
      for (const [key, value] of Object.entries(text || {})) cache.set(key, value)
      return cache
    }
  } catch {
    // No Functions (dev), offline, signed out — all fall through to the file.
  }

  const file = await readLocalFile()
  for (const key of wanted) {
    const value = file[key]
    if (typeof value === 'string' && value.trim()) cache.set(key, value)
  }
  return cache
}

/** What the book says for a key, or null. `book` is the map from the hook. */
export function textFor(book, key) {
  if (!book || !key) return null
  const value = book instanceof Map ? book.get(key) : book[key]
  return typeof value === 'string' && value.trim() ? value : null
}

/** Testing seam — the cache is module-level and would leak between cases. */
export function resetBookCache() {
  cache.clear()
  asked.clear()
  localFile = null
}
