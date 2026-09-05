import { useState, useEffect, useMemo } from 'react'
import { Label, Field, Button, Input, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import FlipInput from '../FlipInput.jsx'
import { advancementLine } from '../../data/hank.js'
import {
  boxesCrossed, experienceWasted, trackIsFull, TOTAL_EXPERIENCE_BOXES,
} from '../../lib/aftermath.js'
import { offerFor, findTable, EXPERIENCE_TRACK } from '../../data/advancements.js'
import {
  needsTarget, targetsFor, advancementsOn, isTriggerRow, TRIGGER,
} from '../../lib/advancement.js'
import { sourceSlug, findEntry } from '../../lib/rules.js'
import { uid } from '../../lib/shape/arsenal.js'
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
 *
 * ## A tier-1 advancement is not finished until it has an action
 *
 * p. 31: "choose one attack action on your leader on which to apply this
 * modifier. This modifier only applies to the selected action." So the target
 * is asked for here and recorded on the entry, and `lib/advancement.js` is what
 * puts it back on the card. Before v0.22.2 it was never asked, which left the
 * modifier attached to nothing.
 *
 * ## The row, not the name
 *
 * The option select carries an **index** into the offer rather than the name.
 * "Skill Boost" is printed three times on the attack table — Skl 4→5, 5→6 and
 * 6→7 — so a select keyed by name hands back whichever comes first, and a
 * leader who earned the 6 gets recorded as having earned the 5.
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

const BLANK = {
  tableId: '', value: null, cheated: false, pick: '', text: '', to: 'leader', target: '',
}

export default function PhaseAdvance({
  week, leader, arsenal, earned, record, onTake, onDone, rules,
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

  const [draft, setDraft] = useState(BLANK)
  const table = draft.tableId ? findTable(draft.tableId) : null
  const options = table ? offerFor(table, table.flip === 'choose' ? null : draft.value) : []
  const entry = draft.pick === '' ? null : options[Number(draft.pick)] || null

  /**
   * Who the advancement is for, and so whose actions are on offer.
   *
   * A totem's actions come off a card this app does not store (§4), so
   * `targetsFor` finds nothing for one and the written-in field below takes
   * over. The same field catches a leader whose picks were all hand-entered.
   */
  const holder = draft.to === 'totem' ? arsenal.totem : leader

  /**
   * A pick resolved to its register action, for the Skl conditions.
   *
   * Read through `rules.card` rather than fetched here: `LeaderRecord` and the
   * arsenal sheet have already asked for these models, and a phase screen is
   * not the place to start a round of network requests. Unresolved simply means
   * the target is offered with an unknown verdict.
   */
  const actionFor = (target) => {
    const slug = sourceSlug(target)
    const card = slug && rules ? rules.card(slug) : null
    return card ? findEntry(card, target.slot, target.name) : null
  }

  /**
   * The leader's source models, asked for once.
   *
   * A Skl modifier's legality is a fact on the register's copy of the action,
   * so this screen needs the same handful of cards the record reads. Bounded by
   * the slot picks — three or four models — and idempotent all the way down.
   */
  const pickSlugs = useMemo(() => {
    const out = new Set()
    for (const slot of ['attack', 'tactical']) {
      for (const pick of leader.picks?.[slot] || []) {
        const slug = sourceSlug(pick)
        if (slug) out.add(slug)
      }
    }
    return [...out]
  }, [leader.picks])

  const fingerprint = pickSlugs.join('|')
  useEffect(() => {
    if (!rules) return
    pickSlugs.forEach((slug) => rules.ensure(slug))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, rules?.ensure])

  const targets = table ? targetsFor(holder, table, entry, actionFor) : []
  const wantsTarget = needsTarget(table)
  const writeTarget = wantsTarget && targets.length === 0
  const chosenTarget = targets.find((t) => t.key === draft.target) || null

  /**
   * How many triggers this action has already gained, which is what the fee
   * turns on. The source model's own triggers are **not** counted, and that is
   * not an oversight: a leader taking an ally's action does not take its
   * triggers (§4). So an advancement trigger is the only kind an action here
   * can have, and the app can count them exactly.
   */
  const triggersHere = chosenTarget
    ? advancementsOn(holder, chosenTarget.key).filter(isTriggerRow).length
    : 0

  const isFirst = checked === 0
  const targetName = writeTarget ? draft.text.trim() : chosenTarget?.name || ''
  const ready = Boolean(
    table
    && (table.freeText ? draft.text.trim() : entry)
    && (!wantsTarget || targetName)
  )

  function commit() {
    if (!current || !table || !ready) return
    onTake({
      /**
       * Its own id, so an undo removes the row it made. Two Skill Boosts on one
       * leader are indistinguishable by name, and `rewind.js` was matching by
       * name — which meant undoing the second could take the first.
       */
      id: uid('adv'),
      boxIndex: current.boxIndex,
      tier: current.tier,
      tableId: table.id,
      tableName: table.name,
      name: table.freeText ? draft.text.trim() : entry.name,
      page: entry?.page ?? table.page,
      flipValue: table.flip === 'choose' ? null : draft.value,
      /** Whether the flip was cheated. It changes no advancement result, but
          the card came out of the same hand every later phase draws on. */
      cheated: table.flip === 'choose' ? false : draft.cheated,
      to: draft.to,
      /** Totem rows carry a stat line; a totem taken here becomes the crew's. */
      stats: entry?.stats ?? null,
      /**
       * The row's own flip value, which is half of its identity — the name is
       * the other half and neither is enough alone.
       */
      tableValue: entry?.value ?? null,
      /** The action this modifier lives on, or null where the table grants
          something new rather than modifying something already there. */
      appliesTo: wantsTarget
        ? writeTarget
          ? { key: null, name: targetName, slot: table.targetSlot, written: true }
          : { key: chosenTarget.key, name: chosenTarget.name, slot: chosenTarget.slot, gained: chosenTarget.gained }
        : null,
    })
    setDraft(BLANK)
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
                    {done
                      ? `${done.name} (${done.tableName})${done.appliesTo ? ` — on ${done.appliesTo.name}` : ''}`
                      : b.grantsAdvancement ? 'to choose' : '—'}
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
              onChange={(e) => setDraft({ ...BLANK, to: draft.to, tableId: e.target.value })}
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
              cheated={draft.cheated}
              onChange={(next) => setDraft((d) => ({
                ...d,
                value: next.value,
                cheated: next.cheated,
                // Ticking "cheated" is not changing the flip, and it used to
                // clear the choice underneath it. Only a different card does.
                ...(next.value === d.value ? {} : { pick: '', target: '' }),
              }))}
              needsSuit={false}
              cheatedLabel="Cheated from my aftermath hand"
            />
          )}

          {table?.freeText && (
            <Field>
              <Label>What you added to the crew card</Label>
              <Input
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
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
              <Select
                value={draft.pick}
                onChange={(e) => setDraft({ ...draft, pick: e.target.value, target: '' })}
              >
                <option value="">Choose one…</option>
                {options.map((o, i) => (
                  <option key={`${o.name}-${i}`} value={String(i)}>
                    {o.name}
                    {o.type ? ` — ${o.type}` : ''}
                    {o.statTo != null ? ` ${o.statFrom.join('/')} → ${o.statTo}` : ''}
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

          {/* The target. Asked after the row, because the row decides which
              actions are even legal — a Skl modifier names the Skl it lifts. */}
          {wantsTarget && entry && !writeTarget && (
            <Field>
              <Label>Which {table.targetSlot} action does it go on?</Label>
              <Select
                value={draft.target}
                onChange={(e) => setDraft({ ...draft, target: e.target.value })}
              >
                <option value="">Choose an action…</option>
                {targets.map((t) => (
                  <option key={t.key} value={t.key} disabled={t.eligible === false}>
                    {t.name}
                    {t.model ? ` — from ${t.model}` : t.gained ? ' — gained by advancement' : ''}
                    {t.why ? ` · ${t.why}` : ''}
                  </option>
                ))}
              </Select>
              {chosenTarget?.eligible === null && (
                <p className="gap-note">
                  <strong>The app cannot check this one.</strong> {chosenTarget.why}.
                  It is recorded either way — your cards remain the authority.
                </p>
              )}
              {targets.every((t) => t.eligible === false) && (
                <p className="note note--warn">
                  No action on this leader qualifies for that row. Take a
                  different one, or check the card yourself.
                </p>
              )}
            </Field>
          )}

          {writeTarget && entry && (
            <Field>
              <Label>Which action does it go on?</Label>
              <Input
                value={draft.text}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                placeholder="Write the action's name"
              />
              <p className="note">
                {draft.to === 'totem'
                  ? 'A totem’s actions come off its card, which this app does not store — so the name is written in.'
                  : 'Nothing to pick from, so write the action in. It is recorded on the advancement either way.'}
              </p>
            </Field>
          )}

          {table?.triggerCrowdingFee > 0 && entry?.type === TRIGGER && (
            <p className="gap-note">
              <strong>Watch the trigger count.</strong> Adding a trigger to an
              action that already has two or more costs {table.triggerCrowdingFee}{' '}
              scrip.{' '}
              {chosenTarget
                ? `${targetName} has ${triggersHere} from advancements — the app does not count the source model's, because a leader taking an ally's action does not take its triggers.`
                : 'Check the action before you take it.'}{' '}
              The app does not deduct it; pay it yourself if it applies.
            </p>
          )}

          {arsenal.totem && (
            <Field>
              <Label>Who gets it</Label>
              <Select
                value={draft.to}
                onChange={(e) => setDraft({ ...draft, to: e.target.value, target: '', text: '' })}
              >
                <option value="leader">{leader.name || 'The leader'}</option>
                <option value="totem">{arsenal.totem.name || 'The totem'}</option>
              </Select>
              <p className="note">
                Once there is a totem, any advancement may go to it instead. Both
                count toward the campaign rating either way.
              </p>
            </Field>
          )}

          <Button onClick={commit} disabled={!ready}>
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
