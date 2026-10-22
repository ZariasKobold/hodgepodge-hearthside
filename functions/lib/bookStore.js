/**
 * The campaign book's text, for any signed-in player.
 *
 * ## What changed at v0.37.0, by owner decision
 *
 * Until then this file gated the text three ways: a question only a book owner
 * could answer (`book_access`), an entitlement computed from what the caller's
 * arsenals held, and a daily allowance of new keys. The owner retired all
 * three: the gate could not be enforced (audit v0.28.1 H2 — `arsenals.doc` is
 * whatever the client last PUT), and nothing else does what this app does for
 * campaign play. The owner will name this to Wyrd when submitting the app, as
 * something they can ask to have switched off.
 *
 * What is left is deliberate:
 *
 *   - **Signed in.** No anonymous read, so no crawler and no drive-by scrape.
 *   - **D1, not the repository.** A public commit cannot be un-published; a
 *     table can be emptied with one `DELETE FROM book_text`, and that is the
 *     whole of switching it off if Wyrd asks.
 *   - **No write endpoint.** Rows are loaded by hand with
 *     `wrangler d1 execute --file` from `scripts/book-to-sql.mjs`.
 *   - **Only what BiggerHat does not carry.** An advancement that is the same
 *     trigger, action or ability as one on a published card is read live from
 *     BiggerHat instead (`src/data/bookSources.js`), and its row never needs
 *     loading here.
 *
 * `book_text` is the one table with no `owner_user_id`. It is shared reference
 * data and nobody's campaign, so there is no caller to scope it by.
 */

/** The same guard as `campaignStore.js`. A missing subject is an exception. */
function requireSubject(userId, fn) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error(`${fn} was called without a user — refusing to touch the database.`)
  }
  return userId
}

/** How many keys one request may ask about. A filter still needs a ceiling. */
export const MAX_KEYS = 200

/**
 * Text for the keys asked about. Keys with no row are simply absent.
 *
 * The list is bound as one JSON array and opened with `json_each`, rather than
 * one `?` per key: D1 allows 100 bound parameters a statement, and MAX_KEYS is
 * 200.
 */
export async function getBookText(userId, keys, env) {
  requireSubject(userId, 'getBookText')

  const asked = Array.isArray(keys)
    ? [...new Set(keys.filter((k) => typeof k === 'string' && k))].slice(0, MAX_KEYS)
    : []
  if (asked.length === 0) return {}

  const { results } = await env.DB.prepare(
    `SELECT key, text FROM book_text WHERE key IN (SELECT value FROM json_each(?))`
  ).bind(JSON.stringify(asked)).all()

  const out = {}
  for (const row of results || []) out[row.key] = row.text
  return out
}
