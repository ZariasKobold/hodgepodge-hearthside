import { useState } from 'react'
import { candidatesFor } from '../lib/validation.js'
import { slotLabel } from '../data/archetypes.js'
import { selectPrompt, selectReaction } from '../data/hank.js'
import { sourceSlug } from '../lib/rules.js'
import { Label, Stamp } from './ui.jsx'
import HankSays from './HankSays.jsx'
import ManualPick from './ManualPick.jsx'
import { RulesTip, RulesState } from './RulesText.jsx'

export default function SelectionSlot({ slot, archetype, leader, roster, rules, onChange }) {
  const config = archetype.slots[slot]
  // Hooks run before the early return, so this component keeps a stable order
  // even for the slots an archetype does not use.
  const [preview, setPreview] = useState(null)
  if (config.n === 0) return null

  const chosen = leader.picks[slot] || []
  const complete = chosen.length === config.n
  const candidates = candidatesFor(slot, roster, archetype.id, leader.keywords)

  const add = (row) => {
    if (chosen.length >= config.n) return
    onChange(slot, [
      ...chosen,
      { key: row.key, name: row.name, model: row.model.name, cost: row.model.cost, triggers: row.triggers },
    ])
    setPreview(null)
  }
  const drop = (key) => onChange(slot, chosen.filter((c) => c.key !== key))

  const look = (row) => {
    rules.ensure(row.model.slug)
    setPreview({ slug: row.model.slug, name: row.name, model: row.model.name })
  }

  return (
    <section className="slot">
      <div className="slot__head">
        <Label>
          {slotLabel(slot)} — {config.n} from an ally of cost {config.cap} or less
        </Label>
        <Stamp ok={complete} label={complete ? 'CLEARED' : `${chosen.length}/${config.n}`} />
      </div>

      {!complete && (
        <HankSays tone="quiet">{selectPrompt({ slot, index: chosen.length })}</HankSays>
      )}

      {chosen.map((pick, i) => (
        <div key={pick.key}>
          <RulesTip rules={rules} slug={sourceSlug(pick)} slot={slot} name={pick.name}>
            <div className="pick">
              <div>
                <div className="pick__name">{pick.name}</div>
                <div className="pick__meta">
                  {pick.model} · {pick.cost}ss{pick.manual ? ' · entered by hand' : ''}
                </div>
              </div>
              <button className="pick__drop" onClick={() => drop(pick.key)}>REMOVE</button>
            </div>
          </RulesTip>
          <HankSays tone="quiet">
            {selectReaction({ cost: pick.cost, cap: config.cap, index: i })}
          </HankSays>
        </div>
      ))}

      {chosen.length < config.n && (
        candidates.length > 0 ? (
          <>
            {/* The list scrolls, so a floating tip would be clipped by its own
                container. The reading panel sits underneath it instead, which
                also means the text holds still while you keep browsing. */}
            <div className="scroller" onMouseLeave={() => setPreview(null)}>
              {candidates.map((row) => (
                <button
                  className={`row${preview?.slug === row.model.slug && preview?.name === row.name ? ' row--peeking' : ''}`}
                  key={row.key}
                  onClick={() => add(row)}
                  onMouseEnter={() => look(row)}
                  onFocus={() => look(row)}
                >
                  <span>{row.name}</span>
                  <span className="row__meta">{row.model.name} · {row.model.cost}ss</span>
                </button>
              ))}
            </div>
            {preview && (
              <div className="peek">
                <div className="peek__head">
                  {preview.name} <span>— {preview.model}</span>
                </div>
                <RulesState
                  rules={rules}
                  slug={preview.slug}
                  slot={slot}
                  name={preview.name}
                  quiet
                />
              </div>
            )}
          </>
        ) : (
          <ManualPick slot={slot} cap={config.cap} onAdd={(entry) => onChange(slot, [...chosen, entry])} />
        )
      )}
    </section>
  )
}
