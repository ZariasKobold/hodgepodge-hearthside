/**
 * The campaign book's text, served only for what a player actually holds.
 *
 * ## The rule this file exists to enforce
 *
 * `book_text` is the one table in this schema with no `owner_user_id` — it is
 * shared reference data, not anybody's campaign. So the usual guard ("every
 * statement filters on the caller") cannot apply, and something has to take its
 * place:
 *
 *   > A caller may read the text for an entry **only if one of their own
 *   > arsenals holds that entry.** The entitled set is computed from their own
 *   > rows, never from the request.
 *
 * The request says which keys it wants. It is a filter, not a grant: anything
 * asked for that is not entitled is simply absent from the answer, and asking
 * for the whole book returns only the handful you have earned.
 *
 * ## Why that is the strong version
 *
 * Gating on "is signed in" alone would be weak — signing in costs a Discord
 * account, and one authenticated request could then walk all 340 keys. Gating
 * on *what you hold* means collecting the book requires actually earning every
 * advancement and buying every item, across many real campaign weeks, which is
 * not a scrape. That property is the whole reason this is a D1 table with an
 * entitlement check rather than a JSON file behind a login.
 *
 * The cost is deliberate and worth naming: **the barter counter cannot show
 * text for something you have not bought yet.** An item on offer is not held,
 * so it is not entitled. Widening this to "anything your current flip reveals"
 * would need the offer tables on the edge — `functions/` may not import from
 * `src/` (§6) — and would hand anyone a way to enumerate equipment by claiming
 * flips. Held-only is both the enforceable answer and the safer one.
 *
 * ## Query budget
 *
 * Two statements, whatever the size of the shelf: one to read the caller's
 * arsenals, one `IN (...)` for the keys. §12 bars a query per arsenal or per
 * row, and this obeys it.
 */

/** The same guard as `campaignStore.js`. A missing subject is an exception. */
function requireSubject(userId, fn) {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error(`${fn} was called without a user — refusing to touch the database.`)
  }
  return userId
}

/**
 * The key for one advancement, character for character as `src/lib/book.js`
 * builds it.
 *
 * Duplicated across the `src/` ↔ `functions/` line on purpose: §6 forbids the
 * import, and a third `shared/` folder is not warranted by two small functions.
 * **If either side changes, change both** — a silent divergence here means the
 * server never entitles anything and the text quietly stops appearing.
 *
 * `value` on a row from the data file, `tableValue` on one recorded against a
 * leader. Reading only one of them was a real bug on the client (v0.25.0) and
 * would be the same bug here.
 */
function advancementKey(entry) {
  if (!entry?.tableId || !entry?.name) return null
  const value = entry.value ?? entry.tableValue ?? '?'
  return `advancement:${entry.tableId}:${value}:${entry.name}`
}

/**
 * Every key the caller's arsenals entitle them to.
 *
 * Reads `doc`, which is the source of truth — the normalized columns are a
 * projection and `injuries` / `equipment` still ride only inside the document
 * (migration 0002).
 */
function entitledKeys(docs) {
  const keys = new Set()

  for (const raw of docs) {
    let doc
    try {
      doc = JSON.parse(raw)
    } catch {
      // A corrupt document entitles nothing. It must not throw: one bad row
      // would otherwise take the text away from every other leader too.
      continue
    }
    if (!doc || typeof doc !== 'object') continue

    const advancements = [
      ...(doc.leader?.advancements || []),
      ...(doc.totem?.advancements || []),
      ...(doc.crewCardAdvancements || []),
    ]
    for (const a of advancements) {
      const key = advancementKey(a)
      if (key) keys.add(key)
    }

    for (const e of doc.equipment || []) {
      if (e?.equipmentId) keys.add(`equipment:${e.equipmentId}`)
    }

    // Injuries are kept rather than deleted when healed (`removedAt`), and a
    // healed injury is still part of this leader's story — the ledger shows it,
    // so the text stays readable for it.
    for (const i of doc.injuries || []) {
      if (i?.injuryId) keys.add(`injury:${i.injuryId}`)
      else if (i?.id) keys.add(`injury:${i.id}`)
    }
  }

  return keys
}

/** How many keys one request may ask about. A filter still needs a ceiling. */
const MAX_KEYS = 200

/* ── proving you own the book ───────────────────────────────────── */

/**
 * Wrong answers allowed before the challenge closes for a while.
 *
 * A stat line is a small number — "what is the Dmg?" has perhaps a dozen
 * plausible answers — so an unlimited-attempt challenge is not a challenge.
 * Counted per user rather than per challenge, so cycling questions does not
 * reset it.
 */
export const MAX_FAILURES = 8
/** How long a locked-out user waits. Long enough to deter, short enough to forgive. */
export const LOCKOUT_MS = 15 * 60 * 1000

/**
 * Compare answers as people type them, not as bytes.
 *
 * Case, surrounding space, runs of space and trailing punctuation are all noise
 * — somebody reading "Dmg 3" off a page may type "3", "3.", or " 3 ". None of
 * those is a different answer, and refusing them teaches the player that the
 * app is broken rather than that they are wrong.
 *
 * Shared with `scripts/book-challenges.mjs`, which hashes at authoring time
 * through this exact function. If it changes, every stored hash is invalidated.
 */
export function normaliseAnswer(input) {
  return String(input ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** SHA-256 of the normalised answer. Plaintext never reaches the database. */
export async function hashAnswer(input) {
  const data = new TextEncoder().encode(normaliseAnswer(input))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Titles this user has already proved they own. */
export async function grantedTitles(userId, env) {
  requireSubject(userId, 'grantedTitles')
  const { results } = await env.DB.prepare(
    `SELECT title FROM book_access WHERE user_id = ?`
  ).bind(userId).all()
  return new Set((results || []).map((r) => r.title))
}

/**
 * A question for a title this user has not proved yet.
 *
 * Returns `null` when they already have access — the caller then never shows
 * the gate, which is what "asked once" means. **The answer hash is never in
 * the response**; only the id and the question text leave this function.
 *
 * Chosen by a rotating index rather than at random so a reload does not reroll
 * into an easier question, and so two devices show the same one.
 */
export async function getChallenge(userId, title, env) {
  requireSubject(userId, 'getChallenge')
  if (typeof title !== 'string' || !title) return null

  const granted = await grantedTitles(userId, env)
  if (granted.has(title)) return null

  const lock = await lockoutFor(userId, title, env)
  if (lock) return { lockedUntil: lock }

  const { results } = await env.DB.prepare(
    `SELECT id, question FROM book_challenges WHERE title = ? ORDER BY id`
  ).bind(title).all()
  if (!results || results.length === 0) return null

  const { results: attempts } = await env.DB.prepare(
    `SELECT failures FROM book_challenge_attempts WHERE user_id = ? AND title = ?`
  ).bind(userId, title).all()
  const failures = attempts?.[0]?.failures ?? 0

  const pick = results[failures % results.length]
  return { id: pick.id, question: pick.question, title }
}

/** Milliseconds until the lockout lifts, or null if they are not locked out. */
async function lockoutFor(userId, title, env) {
  const { results } = await env.DB.prepare(
    `SELECT failures, last_at FROM book_challenge_attempts WHERE user_id = ? AND title = ?`
  ).bind(userId, title).all()
  const row = results?.[0]
  if (!row || row.failures < MAX_FAILURES) return null
  const until = row.last_at + LOCKOUT_MS
  return until > Date.now() ? until : null
}

/**
 * Check an answer and, if it is right, record that this user owns the book.
 *
 * Returns `{ ok, lockedUntil, remaining }`. A correct answer clears the failure
 * counter as well as granting access, so somebody who fumbles twice and then
 * gets it right is not left one slip from a lockout for ever.
 */
export async function answerChallenge(userId, challengeId, answer, env) {
  requireSubject(userId, 'answerChallenge')

  const { results } = await env.DB.prepare(
    `SELECT id, title, answer_hash FROM book_challenges WHERE id = ?`
  ).bind(String(challengeId || '')).all()
  const challenge = results?.[0]
  if (!challenge) return { ok: false, remaining: MAX_FAILURES }

  const locked = await lockoutFor(userId, challenge.title, env)
  if (locked) return { ok: false, lockedUntil: locked, remaining: 0 }

  const given = await hashAnswer(answer)
  // Not a timing-safe comparison, and it does not need to be: both sides are
  // SHA-256 digests of the same length, so there is no length oracle, and the
  // attempt limiter closes the door long before a timing signal is usable.
  const ok = given === challenge.answer_hash

  const now = Date.now()
  if (ok) {
    await env.DB.prepare(
      `INSERT INTO book_access (user_id, title, granted_at, challenge_id)
            VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, title) DO NOTHING`
    ).bind(userId, challenge.title, now, challenge.id).run()
    await env.DB.prepare(
      `DELETE FROM book_challenge_attempts WHERE user_id = ? AND title = ?`
    ).bind(userId, challenge.title).run()
    return { ok: true }
  }

  await env.DB.prepare(
    `INSERT INTO book_challenge_attempts (user_id, title, failures, last_at)
          VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id, title) DO UPDATE SET
       failures = failures + 1, last_at = excluded.last_at`
  ).bind(userId, challenge.title, now).run()

  const { results: after } = await env.DB.prepare(
    `SELECT failures FROM book_challenge_attempts WHERE user_id = ? AND title = ?`
  ).bind(userId, challenge.title).all()
  const failures = after?.[0]?.failures ?? 1
  return { ok: false, remaining: Math.max(0, MAX_FAILURES - failures) }
}

/**
 * Text for the keys this caller asked about and is entitled to.
 *
 * Returns a plain `{ key: text }` map. Keys that do not exist, and keys the
 * caller has not earned, are simply absent — the response never says which of
 * the two it was, because "that key exists but is not yours" is itself a fact
 * about the book worth not leaking.
 */
export async function getBookText(userId, keys, env) {
  requireSubject(userId, 'getBookText')

  const asked = Array.isArray(keys)
    ? [...new Set(keys.filter((k) => typeof k === 'string' && k))].slice(0, MAX_KEYS)
    : []
  if (asked.length === 0) return {}

  const { results: arsenals } = await env.DB.prepare(
    `SELECT doc FROM arsenals WHERE user_id = ? AND doc IS NOT NULL`
  ).bind(userId).all()

  const entitled = entitledKeys((arsenals || []).map((r) => r.doc))
  const allowed = asked.filter((k) => entitled.has(k))
  if (allowed.length === 0) return {}

  /**
   * Two gates, and they answer different questions.
   *
   * `book_access` asks *may this person read this book at all* — they proved
   * they own a copy. The entitled set above asks *which rows of it are theirs
   * to see* — the ones their leader has actually earned. Neither implies the
   * other: proving you own the book does not hand you all 340 rows, and
   * earning an advancement does not entitle you to a book you have not shown.
   *
   * A user who has proved nothing gets `{}` here, and the `IN ()` below is
   * never built with an empty title list — SQLite would parse that as a syntax
   * error rather than as "match nothing".
   */
  const titles = [...await grantedTitles(userId, env)]
  if (titles.length === 0) return {}

  const keyMarks = allowed.map(() => '?').join(', ')
  const titleMarks = titles.map(() => '?').join(', ')
  const { results } = await env.DB.prepare(
    `SELECT key, text FROM book_text
      WHERE key IN (${keyMarks}) AND title IN (${titleMarks})`
  ).bind(...allowed, ...titles).all()

  const out = {}
  for (const row of results || []) out[row.key] = row.text
  return out
}

/** Exported for the authorization tests, which assert on the entitled set. */
export const __test = { entitledKeys, advancementKey, MAX_KEYS }
