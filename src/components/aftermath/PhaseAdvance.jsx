import { useState } from 'react'
import { Label, Field, Button, Input, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import FlipInput from '../FlipInput.jsx'
import { advancementLine } from '../../data/hank.js'
import {
  boxesCrossed, experienceWasted, trackIsFull, TOTAL_EXPERIENCE_BOXES,
} from '../../lib/aftermath.js'
import { offerFor, findTable, EXPERIENCE_TRACK } from '../../data/advancements.js'
import { MAX_EXPERIENCE_PER_GAME } from '../../lib/campaign.js'

/**
 * Phase 4 — experience, then one advancement per numbered box crossed.
 *
 * The boxes are resolved **one at a time, in the order reached**, because the
 * book says so and because it matters: a leader crossing a 1 and then a 2 in
 * one aftermath must choose from the tier-1 tables before seeing what the
 * tier-2 box offers, and might well have chosen differently knowing.
 *
 * The tier in a box is a ceiling, not an instruction — "tier equal to or lower
 * than the number shown" — so a 4 opens every table.
 */

function Track({ checked, crossing }) {
  let n = 0
  return (
    <div className="sheet__xp xp--live">
      {EXPERIENCE_TRACK.map((row, r) => (
        <div className="sheet__xp-row" key={r}>
          {row.map((tier, c) => {
            const i = n++
            const state = i < checked ? 'on' : crossing.includes(i) ? 'now' : 'off'
            return (
              <span className={`sheet__xp-box xp-box--${state}`} key={c}>
                {tier ?? ''}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function PhaseAdvance({
  week, leader, arsenal, earned, record, onTake, onDone,
}) {
  const checked = leader.experience?.boxesChecked || 0
  const taken = record.taken || []
  const crossed = boxesCrossed(checked, earned)
  const wasted = experienceWasted(checked, earned)
  const full = trackIsFull(checked)

  // The next box that still needs an answer. Blank boxes need none, so they are
  // stepped past rather than asked about.
  const pending = crossed.filter(
    (b) => b.grantsAdvancement && !taken.some((t) => t.boxIndex === b.boxIndex)
  )
  const current = pending[0] || null

  const [draft, setDraft] = useState({ tableId: '', value: null, cheated: false, choice: '', to: 'leader' })
  const table = draft.tableId ? findTable(draft.tableId) : null
  const options = table ? offerFor(table, table.flip === 'choose' ? null : draft.value) : []

  const isFirst = checked === 0

  function commit() {
    if (!current || !table) return
    const entry = options.find((o) => o.name === draft.choice) || null
    onTake({
      boxIndex: current.boxIndex,
      tier: current.tier,
      tableId: table.id,
      tableName: table.name,
      name: table.freeText ? draft.choice.trim() : entry?.name || draft.choice,
      page: entry?.page ?? table.page,
      flipValue: table.flip === 'choose' ? null : draft.value,
      to: draft.to,
      /** Totem rows carry a stat line; a totem taken here becomes the crew's. */
      stats: entry?.stats ?? null,
      tableValue: entry?.value ?? null,
    })
    setDraft({ tableId: '', value: null, cheated: false, choice: '', to: 'leader' })
  }

  return (
    <>
      <HankSays>{advancementLine({ isFirst, week })}</HankSays>

      <div className="hire__ledger">
        <span><strong>{earned}</strong> of {MAX_EXPERIENCE_PER_GAME} experience</span>
        <span>box <strong>{Math.min(checked + earned, TOTAL_EXPERIENCE_BOXES)}</strong> of {TOTAL_EXPERIENCE_BOXES}</span>
        <span><strong>{pending.length}</strong> to choose</span>
      </div>

      <Track checked={checked} crossing={crossed.map((b) => b.boxIndex)} />

      {full && (
        <p className="note note--warn">
          The track is full. This leader no longer gains experience and cannot
          advance further — everything they are, they already are.
        </p>
      )}

      {wasted > 0 && !full && (
        <p className="gap-note">
          <strong>{wasted} point{wasted > 1 ? 's' : ''} beyond the end of the track.</strong>{' '}
          There is nowhere left to mark them, so they are not banked — a full
          track earns no more experience at all.
        </p>
      )}

      {crossed.length > 0 && (
        <Field>
          <Label>Boxes crossed this aftermath</Label>
          <ul className="hire__list">
            {crossed.map((b) => {
              const done = taken.find((t) => t.boxIndex === b.boxIndex)
              return (
                <li key={b.boxIndex}>
                  <span>
                    Box {b.boxIndex + 1}
                    {b.tier ? ` — tier ${b.tier} or lower` : ' — blank, no advancement'}
                  </span>
                  <span className="hire__paid">
                    {done ? `${done.name} (${done.tableName})` : b.grantsAdvancement ? 'to choose' : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </Field>
      )}

      {current && (
        <div className="hire__quote">
          <Label>Box {current.boxIndex + 1} — choose a table, tier {current.tier} or lower</Label>

          <Field>
            <Select
              value={draft.tableId}
              onChange={(e) => setDraft({ ...draft, tableId: e.target.value, choice: '', value: null })}
            >
              <option value="">Which table…</option>
              {current.tables.map((t) => (
                <option
                  key={t.id}
                  value={t.id}
                  disabled={t.onlyWithoutTotem && Boolean(arsenal.totem)}
                >
                  Tier {t.tier} · {t.name} (p.{t.page})
                  {t.onlyWithoutTotem && arsenal.totem ? ' — you already have a totem' : ''}
                </option>
              ))}
            </Select>
          </Field>

          {table && table.flip !== 'choose' && (
            <FlipInput
              label={table.flip === 'exact'
                ? 'Flip — you may take the entry matching it exactly'
                : 'Flip — you may take anything at that value or lower'}
              value={draft.value}
              onChange={(next) => setDraft({ ...draft, value: next.value, cheated: next.cheated, choice: '' })}
              needsSuit={false}
              cheatedLabel="Cheated from my aftermath hand"
            />
          )}

          {table?.freeText && (
            <Field>
              <Label>What you added to the crew card</Label>
              <Input
                value={draft.choice}
                onChange={(e) => setDraft({ ...draft, choice: e.target.value })}
                placeholder="e.g. Grave's Pull, from Grave Peril"
              />
              <p className="note">
                A tier-4 advancement lifts one effect off a real master's crew
                card, or takes one of the three starting effects. There is no
                table to pick from, so write down what you took — p.{table.page}.
              </p>
            </Field>
          )}

          {table && !table.freeText && (draft.value != null || table.flip === 'choose') && (
            <Field>
              <Label>{options.length} available</Label>
              <Select value={draft.choice} onChange={(e) => setDraft({ ...draft, choice: e.target.value })}>
                <option value="">Choose one…</option>
                {options.map((o, i) => (
                  <option key={`${o.name}-${i}`} value={o.name}>
                    {o.name}
                    {o.type ? ` — ${o.type}` : ''}
                    {typeof o.value === 'number' ? ` (${o.value})` : ''}
                    {` · p.${o.page}`}
                  </option>
                ))}
              </Select>
              {options.length === 0 && (
                <p className="note note--warn">Nothing on that table for that flip.</p>
              )}
            </Field>
          )}

          {table?.triggerCrowdingFee > 0 && draft.choice && (
            <p className="gap-note">
              <strong>Watch the trigger count.</strong> Adding a trigger to an
              action that already has two or more costs{' '}
              {table.triggerCrowdingFee} scrip. Fewer than two and it is free.
              The app cannot see your leader's action card, so pay it yourself if
              it applies.
            </p>
          )}

          {arsenal.totem && (
            <Field>
              <Label>Who gets it</Label>
              <Select value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })}>
                <option value="leader">{leader.name || 'The leader'}</option>
                <option value="totem">{arsenal.totem.name || 'The totem'}</option>
              </Select>
              <p className="note">
                Once there is a totem, any advancement may go to it instead. Both
                count toward the campaign rating either way.
              </p>
            </Field>
          )}

          <Button onClick={commit} disabled={!table || !draft.choice.trim()}>
            Take it
          </Button>
        </div>
      )}

      <Button onClick={onDone} disabled={Boolean(current)}>
        {pending.length ? `${pending.length} still to choose` : 'Done advancing'}
      </Button>
    </>
  )
}
