import { candidatesFor } from '../lib/validation.js'
import { slotLabel } from '../data/archetypes.js'
import { selectPrompt, selectReaction } from '../data/hank.js'
import { Label, Stamp } from './ui.jsx'
import HankSays from './HankSays.jsx'
import ManualPick from './ManualPick.jsx'

export default function SelectionSlot({ slot, archetype, leader, roster, onChange }) {
  const config = archetype.slots[slot]
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
  }
  const drop = (key) => onChange(slot, chosen.filter((c) => c.key !== key))

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
          <div className="pick">
            <div>
              <div className="pick__name">{pick.name}</div>
              <div className="pick__meta">
                {pick.model} · {pick.cost}ss{pick.manual ? ' · entered by hand' : ''}
              </div>
            </div>
            <button className="pick__drop" onClick={() => drop(pick.key)}>REMOVE</button>
          </div>
          <HankSays tone="quiet">
            {selectReaction({ cost: pick.cost, cap: config.cap, index: i })}
          </HankSays>
        </div>
      ))}

      {chosen.length < config.n && (
        candidates.length > 0 ? (
          <div className="scroller">
            {candidates.map((row) => (
              <button className="row" key={row.key} onClick={() => add(row)}>
                <span>{row.name}</span>
                <span className="row__meta">{row.model.name} · {row.model.cost}ss</span>
              </button>
            ))}
          </div>
        ) : (
          <ManualPick slot={slot} cap={config.cap} onAdd={(entry) => onChange(slot, [...chosen, entry])} />
        )
      )}
    </section>
  )
}
