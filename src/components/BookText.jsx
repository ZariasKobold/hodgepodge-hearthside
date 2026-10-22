import { advancementKey, equipmentKey, injuryKey, entryFor } from '../lib/book.js'
import { EntryBody, TriggerBody, IconText } from './RulesText.jsx'

/**
 * What an entry from the campaign book does, read from BiggerHat where the
 * register carries it and from the book's own text where it does not
 * (`lib/book.js`).
 *
 * Renders nothing when neither source answers — signed out, offline, the
 * register down — and the screen then reads as it always did, with the name and
 * the page number. That silence is the contract: never a hole in the page.
 *
 * Pass exactly one of `advancement`, `equipmentId` or `injury` (the upgrade's
 * printed name), or `entry` directly for a totem's own ability or action.
 *
 * Not persisted anywhere, ever (§4).
 */
export default function BookText({ book, advancement, equipmentId, injury, entry: given, bare = false }) {
  const key = advancement
    ? advancementKey(advancement.tableId, advancement)
    : equipmentId
      ? equipmentKey(equipmentId)
      : injury
        ? injuryKey(injury)
        : null

  const entry = given || entryFor(book, key)
  return <BookEntry entry={entry} bare={bare} />
}

/**
 * One entry, in whichever of the shapes `RulesText` already knows. `bare` drops a
 * trigger's suit line, for a list that already prints it beside the name.
 */
export function BookEntry({ entry, bare = false }) {
  if (!entry || entry.source === 'pending') return null

  if (entry.kind === 'action') {
    return <EntryBody entry={entry} slot="attack" showTriggers={false} />
  }
  if (entry.kind === 'trigger') {
    return <TriggerBody trigger={bare ? { ...entry, suits: null } : entry} />
  }
  if (entry.kind === 'ability') {
    return (
      <div className="rules">
        {entry.defence && <div className="rules__stat">{entry.defence}</div>}
        {entry.description && <p className="rules__body"><IconText text={entry.description} /></p>}
      </div>
    )
  }
  if (entry.kind === 'totem') {
    // A totem's parts are drawn by `TotemCard` against its own lists; this is
    // the row's own note, which the Mini-Master alone carries.
    return entry.description
      ? <p className="rules__body book-text"><IconText text={entry.description} /></p>
      : null
  }
  return entry.description
    ? <p className="rules__body book-text"><IconText text={entry.description} /></p>
    : null
}
