import { ARCHETYPES, SLOTS } from '../../data/archetypes.js'
import { CHARACTERISTICS } from '../../data/characteristics.js'
import { Label, Field, Chip, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import { archetypeGreeting, archetypePathReaction } from '../../data/hank.js'

export default function Archetype({ leader, set }) {
  const choose = (id) =>
    set({ archetype: id, picks: { attack: [], tactical: [], ability: [] }, trigger: '' })

  const toggleCharacteristic = (c) => {
    const has = leader.characteristics.includes(c)
    if (has) set({ characteristics: leader.characteristics.filter((x) => x !== c) })
    else if (leader.characteristics.length < 2) set({ characteristics: [...leader.characteristics, c] })
  }

  const pathLine = archetypePathReaction({ path: leader.advancementPath })

  return (
    <>
      <HankSays>{archetypeGreeting({ week: 1 })}</HankSays>

      <Label>Archetype</Label>
      <div style={{ marginBottom: 22 }}>
        {ARCHETYPES.map((a) => {
          const on = leader.archetype === a.id
          const allowances = SLOTS
            .filter((s) => a.slots[s].n > 0)
            .map((s) => `${a.slots[s].n}× ${s} ≤${a.slots[s].cap}ss`)
            .join('   ·   ')
          return (
            <button key={a.id} className={`arch${on ? ' arch--on' : ''}`} onClick={() => choose(a.id)}>
              <div className="arch__head">
                <span className="arch__name">{a.name}</span>
                <span className="arch__stats">
                  Df {a.stats.df} · Wp {a.stats.wp} · Sp {a.stats.sp} · Hp {a.stats.health}
                </span>
              </div>
              <div className="arch__slots">
                {allowances || 'no selections'}{a.keepsTrigger ? '   ·   +1 trigger' : ''}
              </div>
              <div className="arch__note">{a.note}</div>
            </button>
          )
        })}
      </div>

      <Field>
        <Label>Advances as</Label>
        <div className="pair">
          {[
            ['bruiser', 'Bruiser — experience from kills'],
            ['strategist', 'Strategist — experience from Interacts'],
          ].map(([id, label]) => (
            <Chip
              key={id}
              on={leader.advancementPath === id}
              onClick={() => set({ advancementPath: id })}
              style={{ padding: 11, textAlign: 'left' }}
            >
              {label}
            </Chip>
          ))}
        </div>
        <HankSays tone="quiet">{pathLine}</HankSays>
      </Field>

      <Field>
        <Label>Characteristics — up to two, master is automatic</Label>
        <div className="chips">
          {CHARACTERISTICS.map((c) => {
            const on = leader.characteristics.includes(c)
            return (
              <Chip
                key={c}
                on={on}
                disabled={!on && leader.characteristics.length >= 2}
                onClick={() => toggleCharacteristic(c)}
              >
                {c}
              </Chip>
            )
          })}
        </div>
      </Field>

      <div className="pair">
        <div>
          <Label>Size</Label>
          <Select value={leader.size} onChange={(e) => set({ size: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        <div>
          <Label>Base</Label>
          <Select value={leader.base} onChange={(e) => set({ base: Number(e.target.value) })}>
            {[30, 40, 50].map((b) => <option key={b} value={b}>{b}mm</option>)}
          </Select>
        </div>
      </div>
    </>
  )
}
