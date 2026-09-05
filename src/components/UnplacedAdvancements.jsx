import { Label, Field, Button, Input, Select } from './ui.jsx'
import {
  unplacedAdvancements, targetsFor, rowFor, ambiguousRows,
} from '../lib/advancement.js'
import { findTable } from '../data/advancements.js'
import { sourceSlug, findEntry } from '../lib/rules.js'

/**
 * Advancements that were earned before the app asked which action they modify.
 *
 * Every tier-1 advancement recorded before v0.22.2 has no `appliesTo`, because
 * the app threw the target away — so the card cannot show it and there is no
 * way back in. A finished aftermath is closed for good (`Aftermath.jsx` picks
 * the open game with `!done`), and the two obvious workarounds are both worse
 * than the problem: an export re-imports as a *new* arsenal, and a hand-edit to
 * localStorage skips `saveArsenal`, so the dirty flag is never set and the fix
 * never reaches D1.
 *
 * ## Rows are addressed by index, never by id
 *
 * **Nothing recorded before v0.22.2 has an `id`** — `uid('adv')` landed in the
 * same change that started asking the question this repairs. The first cut
 * keyed the draft state and the write on `adv.id`, so both were `undefined` on
 * every legacy row: the two dropdowns shared one slot and one button wrote both
 * advancements. Reported within the hour of shipping, and it never showed in a
 * test because the fixture invented ids the real legacy shape does not have.
 * **A fixture that is easier than production is not a fixture.**
 *
 * ## The recorded row may also be wrong
 *
 * "Skill Boost" is printed three times on the attack table and twice on the
 * tactical one, and until v0.22.2 the option select was keyed by name — so it
 * recorded whichever came first regardless of what was taken. For those rows
 * the repair offers the alternatives (`ambiguousRows`) rather than holding the
 * player to a guess, because otherwise a leader who really took the Skl 5→6
 * boost finds their only action greyed out as "needs 4" and has nowhere to go.
 *
 * ## And it cannot refuse an answer it merely cannot read
 *
 * `targetsFor` marks an unreadable action unknown rather than illegal, and
 * there is a written-in field for a leader whose actions this app cannot list.
 * Someone repairing months-old data must not be blocked by a register outage
 * (§6).
 */
export default function UnplacedAdvancements({
  arsenal, leader, rules, draft, onDraft, onPlace,
}) {
  const rows = [
    ...rowsFor(leader, 'leader'),
    ...rowsFor(arsenal.totem, 'totem'),
  ]
  if (rows.length === 0) return null

  const actionFor = (target) => {
    const slug = sourceSlug(target)
    const card = slug && rules ? rules.card(slug) : null
    return card ? findEntry(card, target.slot, target.name) : null
  }

  return (
    <section className="repair noprint">
      <Label>
        {rows.length} advancement{rows.length === 1 ? '' : 's'} not on an action yet
      </Label>
      <p className="gap-note">
        <strong>These were earned before the app asked which action they modify.</strong>{' '}
        A tier-1 advancement only applies to the one action you chose at the
        table (p.31), and that answer was never recorded — so the card cannot
        show it. Name the action and it will appear where it belongs.
      </p>

      {rows.map(({ adv, to, holder, at }) => {
        const id = `${to}:${at}`
        const table = findTable(adv.tableId)
        const choices = ambiguousRows(adv)

        /**
         * Which row this was.
         *
         * For a repeated name the select is authoritative, because the recorded
         * value is a guess the old code made and the player is looking straight
         * at the alternatives. It falls back to index 0 rather than to nothing:
         * a record with no flip value at all still has to resolve to something
         * the player can then correct, and offering a disabled screen instead
         * would be the app refusing to be fixed.
         */
        const recorded = rowFor(adv)
        const rowIndex = draft[`${id}:row`] != null
          ? Number(draft[`${id}:row`])
          : Math.max(0, choices.indexOf(recorded))
        const entry = choices.length > 1 ? choices[rowIndex] : recorded

        const targets = targetsFor(holder, table, entry, actionFor)
        const value = draft[id] || ''
        const chosen = targets.find((t) => t.key === value) || null
        const written = targets.length === 0
        const name = written ? value.trim() : chosen?.name

        return (
          <Field key={id}>
            <Label>
              {adv.name} — {adv.tableName}
              {to === 'totem' ? ' · the totem’s' : ''}
            </Label>

            {choices.length > 1 && (
              <>
                <Select
                  value={String(rowIndex)}
                  onChange={(e) => onDraft(`${id}:row`, e.target.value)}
                >
                  {choices.map((c, i) => (
                    <option key={i} value={String(i)}>
                      {c.statTo != null ? `Skl ${c.statFrom.join('/')} → ${c.statTo}` : c.name}
                      {` — flip ${c.value} · p.${c.page}`}
                    </option>
                  ))}
                </Select>
                <p className="note">
                  “{adv.name}” is printed {choices.length} times on that table
                  and older records did not keep which one you took — so this is
                  the app’s guess, not yours. Correct it if it is wrong.
                </p>
              </>
            )}

            {written ? (
              <Input
                value={value}
                onChange={(e) => onDraft(id, e.target.value)}
                placeholder={`Write the ${table.targetSlot} action’s name`}
              />
            ) : (
              <Select value={value} onChange={(e) => onDraft(id, e.target.value)}>
                <option value="">Which {table.targetSlot} action…</option>
                {targets.map((t) => (
                  <option key={t.key} value={t.key} disabled={t.eligible === false}>
                    {t.name}
                    {t.model ? ` — from ${t.model}` : t.gained ? ' — gained by advancement' : ''}
                    {t.why ? ` · ${t.why}` : ''}
                  </option>
                ))}
              </Select>
            )}

            {chosen?.eligible === null && (
              <p className="note">
                The app cannot check this one — {chosen.why}. It is recorded
                either way; your cards remain the authority.
              </p>
            )}

            {!entry && (
              <p className="note note--warn">
                This row cannot be matched back to the book, so the app will not
                guess what it changed. The action is still worth naming.
              </p>
            )}

            <Button
              onClick={() => {
                if (!name) return
                onPlace(at, {
                  appliesTo: written
                    ? { key: null, name, slot: table.targetSlot, written: true }
                    : { key: chosen.key, name: chosen.name, slot: chosen.slot, gained: chosen.gained },
                  // The row is written back only where it was in question —
                  // the select was on screen and the player either confirmed or
                  // corrected it. A repair must not rewrite a fact nobody was
                  // asked about.
                  ...(choices.length > 1 && entry
                    ? { tableValue: entry.value, page: entry.page }
                    : {}),
                }, { to })
              }}
              disabled={!name}
            >
              Put it on {name || 'an action'}
            </Button>
          </Field>
        )
      })}
    </section>
  )
}

/**
 * The unplaced rows of one holder, each with its index in that holder's own
 * `advancements` array — which is the only identity a legacy row has.
 */
function rowsFor(holder, to) {
  if (!holder) return []
  return unplacedAdvancements(holder).map((adv) => ({
    adv,
    to,
    holder,
    at: holder.advancements.indexOf(adv),
  }))
}
