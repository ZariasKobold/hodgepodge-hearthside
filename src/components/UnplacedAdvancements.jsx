import { Label, Field, Button, Input, Select } from './ui.jsx'
import {
  unplacedAdvancements, targetsFor, rowFor,
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
 * Hence a repair, and three things about its shape:
 *
 * - **It lives on the arsenal, not in the aftermath.** This is fixing what the
 *   leader *is*, not re-playing an evening. The aftermath record stays exactly
 *   as it was written, because it is a true account of what the app knew at the
 *   time and `lib/rewind.js` reads it as provenance.
 * - **It disappears when it is finished**, and never comes back. A repair that
 *   is a permanent fixture reads as a feature, and this is a one-time cost of a
 *   change that should have asked the question from the start.
 * - **It cannot refuse an answer it merely does not understand.** `targetsFor`
 *   marks an unreadable action unknown rather than illegal, and there is a
 *   written-in field for a leader whose actions this app cannot list at all.
 *   Someone repairing months-old data must not be told their advancement is
 *   invalid by an app that simply cannot see the card (§6).
 */
export default function UnplacedAdvancements({
  arsenal, leader, rules, draft, onDraft, onPlace,
}) {
  const rows = [
    ...unplacedAdvancements(leader).map((a) => ({ adv: a, to: 'leader', holder: leader })),
    ...unplacedAdvancements(arsenal.totem).map((a) => ({ adv: a, to: 'totem', holder: arsenal.totem })),
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
        show it. Name the action and it will appear where it belongs. Nothing
        else changes: the row, the flip and the page are already right.
      </p>

      {rows.map(({ adv, to, holder }) => {
        const table = findTable(adv.tableId)
        const entry = rowFor(adv)
        const targets = targetsFor(holder, table, entry, actionFor)
        const value = draft[adv.id] || ''
        const chosen = targets.find((t) => t.key === value) || null
        const written = targets.length === 0

        return (
          <Field key={adv.id}>
            <Label>
              {adv.name} — {adv.tableName}
              {adv.page ? `, p.${adv.page}` : ''}
              {to === 'totem' ? ' · the totem’s' : ''}
            </Label>

            {written ? (
              <Input
                value={value}
                onChange={(e) => onDraft(adv.id, e.target.value)}
                placeholder={`Write the ${table.targetSlot} action’s name`}
              />
            ) : (
              <Select value={value} onChange={(e) => onDraft(adv.id, e.target.value)}>
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
                This row cannot be resolved back to the book — “{adv.name}” is
                printed more than once on that table and the flip value was not
                recorded, so the app will not guess which one it was. The action
                is still worth naming; the Skl change is not, and will not show.
              </p>
            )}

            <Button
              onClick={() => {
                const name = written ? value.trim() : chosen?.name
                if (!name) return
                onPlace(adv.id, written
                  ? { key: null, name, slot: table.targetSlot, written: true }
                  : { key: chosen.key, name: chosen.name, slot: chosen.slot, gained: chosen.gained },
                { to })
              }}
              disabled={written ? !value.trim() : !chosen}
            >
              Put it on {written ? (value.trim() || 'that action') : (chosen?.name || 'an action')}
            </Button>
          </Field>
        )
      })}
    </section>
  )
}
