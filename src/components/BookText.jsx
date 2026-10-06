import { advancementKey, equipmentKey, injuryKey, textFor } from '../lib/book.js'

/**
 * One entry's text from the player's own copy of the campaign book.
 *
 * Renders nothing at all when there is no `public/book.json`, which is the
 * ordinary case — the screen then reads exactly as it did before, with the name
 * and the page number. That silence is the whole contract: this is an addition
 * for a player who owns the book, never a hole in the page for one who does not.
 *
 * Pass exactly one of `advancement`, `equipmentId` or `injury` (the upgrade's
 * printed name).
 *
 * Not persisted anywhere, ever (§4) — see `lib/book.js`.
 */
export default function BookText({ book, advancement, equipmentId, injury }) {
  const key = advancement
    ? advancementKey(advancement.tableId, advancement)
    : equipmentId
      ? equipmentKey(equipmentId)
      : injury
        ? injuryKey(injury)
        : null

  const text = textFor(book, key)
  if (!text) return null

  return <p className="book-text">{text}</p>
}
