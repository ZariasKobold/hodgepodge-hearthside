import { useState } from 'react'
import { Label, Field, Select } from '../ui.jsx'
import {
  liveModels, liveEquipment, injuryCountForModel, injuriesFor,
} from '../../lib/shape/arsenal.js'
import {
  hireCostOf, paysKeywordTax, crewCost, hiredModels, crewRating, crewInjuryCount,
  hiredEquipment, encounterProblems, outOfKeywordModels, toggleModel, toggleTotem,
  attachEquipment, OUT_OF_KEYWORD_LIMIT, LEADER, TOTEM,
} from '../../lib/encounter.js'
import { StatCard } from '../CrewCards.jsx'
import LeaderRecord from '../LeaderRecord.jsx'
import TotemCard from '../TotemCard.jsx'

/**
 * Picking a crew out of the arsenal: the one screen both a saved crew and a
 * game's hire step use (v0.34.0).
 *
 * `selection` is anything with `modelIds`, `totem` and `equipment` — a saved
 * crew or an encounter — and `onChange` takes a patch of those. Every number
 * comes from `lib/encounter.js`, which reads either.
 *
 * Owner requests, Session 78:
 * - **The ledger sticks** under the masthead once the list scrolls, so the
 *   running total is in view while picking.
 * - **Hired goes red** when it is over the size being hired to.
 * - **Every row has a caret** that opens that model's card: the leader as this
 *   app's own leader card, the totem off its table row, everyone else read live
 *   from BiggerHat.
 */
export default function CrewPicker({
  selection, onChange, arsenal, leader, archetype, rules, size = null, pool = null, locked = false,
}) {
  const [open, setOpen] = useState(() => new Set())
  const models = liveModels(arsenal)
  const kit = liveEquipment(arsenal)
  const hired = hiredModels(selection, arsenal)
  const spent = crewCost(selection, arsenal)
  const rating = crewRating(selection, arsenal)
  const over = size != null && spent > size
  const outsiders = outOfKeywordModels(selection, arsenal)
  const problems = encounterProblems({ ...selection, encounterSize: size, opponent: {} }, arsenal)
  const holderOf = new Map((selection.equipment || []).map((x) => [x.rowId, x.holder]))

  const toggleCard = (key, slug) => {
    if (slug && !rules.card(slug)) rules.ensure(slug)
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const holders = [
    { key: LEADER, label: leader.name || 'Your leader' },
    ...(selection.totem && arsenal.totem ? [{ key: TOTEM, label: arsenal.totem.name || 'Totem' }] : []),
    ...hired.filter((m) => !m.peon).map((m) => ({ key: m.id, label: m.name })),
  ]
  const leaderHurt = injuriesFor(arsenal, {}).length

  return (
    <>
      <div className="hire__ledger crew__ledger">
        {size != null && <span>size <strong>{size}</strong>ss</span>}
        <span className={over ? 'crew__over' : undefined}>
          hired <strong>{spent}</strong>ss{over ? ` · ${spent - size} over` : ''}
        </span>
        {size != null && !over && <span>left <strong>{size - spent}</strong></span>}
        <span>rating <strong>{rating}</strong></span>
        {pool != null && <span>pool <strong>{pool}</strong></span>}
        <span className={outsiders.length > OUT_OF_KEYWORD_LIMIT ? 'crew__over' : undefined}>
          off keyword <strong>{outsiders.length}</strong>/{OUT_OF_KEYWORD_LIMIT}
        </span>
      </div>

        <Field>
          <Label>Your crew</Label>
          <div className="picklist">
            <Row
              checked disabled
              name={leader.name || 'Your leader'}
              detail={`leader, 0ss${leaderHurt ? ` · ${leaderHurt} injured` : ''}`}
              isOpen={open.has(LEADER)}
              onCaret={() => toggleCard(LEADER)}
              card={<LeaderRecord leader={leader} archetype={archetype} rules={rules} variant="card" />}
            />
            {arsenal.totem && (
              <Row
                disabled={locked}
                checked={Boolean(selection.totem)}
                onToggle={() => onChange(toggleTotem(selection))}
                name={arsenal.totem.name || 'Totem'}
                detail="totem, 0ss"
                isOpen={open.has(TOTEM)}
                onCaret={() => toggleCard(TOTEM)}
                card={<TotemCard totem={arsenal.totem} />}
              />
            )}
            {models.map((m) => {
              const hurt = injuryCountForModel(arsenal, m)
              const card = m.slug ? rules.card(m.slug) : null
              return (
                <Row
                  key={m.id}
                  disabled={locked}
                  checked={selection.modelIds.includes(m.id)}
                  onToggle={() => onChange(toggleModel(selection, m.id))}
                  name={m.name}
                  detail={[
                    `${hireCostOf(m, arsenal)}ss`,
                    paysKeywordTax(m, arsenal) && 'incl. +1 out of keyword',
                    hurt > 0 && `${hurt} injured`,
                    m.peon && 'peon',
                  ].filter(Boolean).join(' · ')}
                  isOpen={open.has(m.id)}
                  onCaret={() => toggleCard(m.id, m.slug)}
                  card={card
                    ? <StatCard card={card} />
                    : (
                      <p className="note">
                        {!m.slug ? 'Entered by hand, so there is no card to read.'
                          : rules.errorFor(m.slug) ? `Could not read this card: ${rules.errorFor(m.slug)}`
                            : 'Reading the card from BiggerHat…'}
                      </p>
                    )}
                />
              )
            })}
            {models.length === 0 && <p className="note">Nothing in the arsenal but the leader.</p>}
          </div>
          <p className="gap-note">
            <strong>Out of keyword costs 1 more</strong>, unless the model is
            Versatile, and <strong>at most {OUT_OF_KEYWORD_LIMIT}</strong> such
            models may be hired (Versatile ones do not count). Both are worked
            out from each model&rsquo;s keywords; one entered by hand counts as in
            keyword.
          </p>
        </Field>

        <Field>
          <Label>Equipment</Label>
          {kit.length === 0 ? (
            <p className="note">None in the arsenal yet. Barter is where it comes from.</p>
          ) : (
            <div className="picklist">
              {kit.map((e) => (
                <div key={e.id} className="crew__row">
                  <span className="crew__kit">{e.name}{e.page ? <span className="hire__adj"> p.{e.page}</span> : null}</span>
                  <Select
                    disabled={locked}
                    value={holders.some((h) => h.key === holderOf.get(e.id)) ? holderOf.get(e.id) : ''}
                    onChange={(ev) => onChange(attachEquipment(selection, e.id, ev.target.value || null))}
                    aria-label={`Who carries ${e.name}`}
                  >
                    <option value="">Left at camp</option>
                    {holders.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
                  </Select>
                </div>
              ))}
            </div>
          )}
          <p className="note">
            Attached free at hiring, and each piece taken adds 1 to your rating.
            Peons never carry equipment (p. 37).
          </p>
        </Field>

      <Field>
        <Label>Campaign rating — {rating}</Label>
        <div className="hire__breakdown">
          <span>equipment taken</span><span className="hire__adj">+{hiredEquipment(selection, arsenal).length}</span>
          <span>leader advancements</span><span className="hire__adj">+{leader.advancements?.length || 0}</span>
          {selection.totem && arsenal.totem && (
            <>
              <span>totem advancements</span>
              <span className="hire__adj">+{arsenal.totem.advancements?.length || 0}</span>
            </>
          )}
          <span>injuries in this crew</span><span className="hire__adj">−{crewInjuryCount(selection, arsenal)}</span>
          <span className="hire__total">{rating}</span>
        </div>
      </Field>

      {problems.length > 0 && (
        <div className="gap-note">
          <strong>Not legal yet.</strong>
          <ul className="crew__problems">
            {problems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}
    </>
  )
}

/** One line of the crew: a checkbox, the name, and a caret that opens its card. */
function Row({ checked, disabled, onToggle, name, detail, isOpen, onCaret, card }) {
  return (
    <div className="crew__entry">
      <div className="crew__row">
        <label className="hire__check">
          <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
          {name}
          <span className="hire__adj"> ({detail})</span>
        </label>
        <button
          type="button"
          className={`crew__caret${isOpen ? ' crew__caret--open' : ''}`}
          onClick={onCaret}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Hide' : 'Show'} ${name}'s card`}
        >
          <span aria-hidden="true">▸</span> card
        </button>
      </div>
      {isOpen && <div className="crew__card">{card}</div>}
    </div>
  )
}
