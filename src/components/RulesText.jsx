import { useState, useId } from 'react'
import { iconSegments, statLine, findEntry } from '../lib/rules.js'

/**
 * Rendering for text this app displays but never stores.
 *
 * Everything here reads through `rules.js`, which holds the text in memory for
 * the life of the tab and nowhere else (§4). Nothing in this file writes.
 *
 * The register's {{icon}} markup is turned into spans rather than injected as
 * HTML — the text is someone else's and arrives over the network, so it is
 * rendered as data, never as markup.
 */

export function IconText({ text }) {
  return (
    <>
      {iconSegments(text).map((seg, i) =>
        seg.kind === 'icon'
          ? <span className="rules__icon" key={i}>{seg.value}</span>
          : <span key={i}>{seg.value}</span>
      )}
    </>
  )
}

/**
 * One action or ability, written out.
 *
 * `showTriggers` is off wherever the reader is a leader rather than the source
 * model. Taking an ally's action does not bring its triggers along — those are
 * earned in campaign play or granted at creation — so printing them on a
 * leader's record would be inventing rules the leader does not have. Crew
 * cards, which describe the actual hired model, pass it on.
 */
export function EntryBody({ entry, slot, showTriggers = true }) {
  if (!entry) return null
  const stats = slot === 'ability' ? [] : statLine(entry)
  const extras = []
  if (slot === 'ability') {
    if (entry.suits) extras.push(entry.suits)
    if (entry.costsStone > 0) extras.push(`${entry.costsStone}ss`)
  }
  const line = stats.length ? stats : extras

  return (
    <div className="rules">
      {line.length > 0 && <div className="rules__stat">{line.join(' · ')}</div>}
      {entry.description && (
        <p className="rules__body"><IconText text={entry.description} /></p>
      )}
      {showTriggers && (entry.triggers || []).length > 0 && (
        <ul className="rules__triggers">
          {entry.triggers.map((t) => (
            <li key={t.slug || t.name}>
              <span className="rules__trigger-k">
                {t.suits ? `${t.suits} — ` : ''}{t.name}
              </span>
              {t.description && <> <IconText text={t.description} /></>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The states between asking for text and having it. Kept in one place because
 * the record, the hover tip and the crew cards all need the same four answers
 * and it would be easy for them to drift into three different vocabularies.
 */
export function RulesState({ rules, slug, slot, name, quiet, showTriggers = true }) {
  if (!slug) {
    return quiet ? null : <div className="rules rules--absent">Entered by hand — no register record to read.</div>
  }
  if (rules.isPending(slug)) {
    return <div className="rules rules--absent">Reading the register…</div>
  }
  const error = rules.errorFor(slug)
  if (error) return <div className="rules rules--absent rules--warn">{error}</div>

  const card = rules.card(slug)
  if (!card) return quiet ? null : <div className="rules rules--absent">Not loaded.</div>

  const entry = findEntry(card, slot, name)
  if (!entry) {
    return <div className="rules rules--absent">Not on {card.name}'s record — the register may have renamed it.</div>
  }
  return <EntryBody entry={entry} slot={slot} showTriggers={showTriggers} />
}

/**
 * Hover-and-focus disclosure for a chosen selection.
 *
 * Focus is a trigger as well as hover, so this is reachable without a mouse.
 * It is supplementary throughout — every fact it shows is also on the finished
 * record — so nothing is lost if it never opens.
 */
export function RulesTip({ rules, slug, slot, name, children, showTriggers = true }) {
  const [open, setOpen] = useState(false)
  const id = useId()

  const show = () => { rules.ensure(slug); setOpen(true) }
  const hide = () => setOpen(false)

  return (
    <div
      className="tipwrap"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hide() }}
    >
      <div aria-describedby={open ? id : undefined}>{children}</div>
      {open && (
        <div className="tip" id={id} role="tooltip">
          <RulesState rules={rules} slug={slug} slot={slot} name={name} showTriggers={showTriggers} />
        </div>
      )}
    </div>
  )
}

/**
 * The one trigger a leader actually keeps, written out.
 *
 * Separate from `EntryBody` on purpose: this renders a trigger the leader
 * holds, whereas the list inside an action describes the source model's.
 */
export function TriggerBody({ trigger }) {
  if (!trigger) return null
  return (
    <div className="rules">
      {trigger.suits && <div className="rules__stat">{trigger.suits}</div>}
      {trigger.description && (
        <p className="rules__body"><IconText text={trigger.description} /></p>
      )}
    </div>
  )
}
