import { useState } from 'react'
import { Button, Input, Stamp } from './ui.jsx'

/**
 * Fallback entry when the register is unreachable.
 *
 * The structural rules still hold with no data at all — a cost ceiling is a
 * cost ceiling whether or not we can confirm the model exists — so the app
 * stays useful offline instead of dead-ending.
 */
export default function ManualPick({ slot, cap, onAdd }) {
  const [model, setModel] = useState('')
  const [cost, setCost] = useState('')
  const [name, setName] = useState('')

  const parsed = parseInt(cost, 10)
  const overCap = !Number.isNaN(parsed) && parsed > cap
  const ready = model.trim() && name.trim() && !Number.isNaN(parsed) && parsed > 0 && !overCap

  function submit() {
    onAdd({
      key: `manual::${model}::${name}`,
      name: name.trim(),
      model: model.trim(),
      cost: parsed,
      triggers: [],
      manual: true,
    })
    setModel(''); setCost(''); setName('')
  }

  return (
    <div style={{ border: '1px solid var(--line)', padding: 13 }}>
      <div className="pair" style={{ marginBottom: 8 }}>
        <Input placeholder="Source model" value={model} onChange={(e) => setModel(e.target.value)} />
        <Input placeholder="Cost" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} />
      </div>
      <Input
        placeholder={slot === 'ability' ? 'Ability name' : 'Action name'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ marginBottom: 8 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        {overCap
          ? <Stamp ok={false} label={`OVER ${cap}SS`} />
          : <span className="label" style={{ margin: 0 }}>Ceiling {cap}ss</span>}
        <Button disabled={!ready} onClick={submit}>Record</Button>
      </div>
    </div>
  )
}
