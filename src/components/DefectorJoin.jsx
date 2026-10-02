import { useState } from 'react'
import { Label, Field, Button, Input, Select } from './ui.jsx'
import { INJURY_TABLE } from '../data/injuries.js'
import { BARTER, THIRST } from '../data/equipment.js'

/** Each injury upgrade once, by name — several are printed under two values. */
const INJURIES = [...new Map(
  INJURY_TABLE.filter((r) => r.injury).map((r) => [r.name, { name: r.name, page: r.page }]),
).values()]

const KIT = [...BARTER, ...THIRST]

/**
 * A model that defected to this crew: the Traitor result (black joker, p. 34).
 *
 * The opponent's own injury phase annihilates it from their arsenal, which the
 * app has always done. Until v0.29.2 nothing let the *receiving* player take
 * the copy the book gives them, and the only route that adds a model is the
 * paid weekly hire. A player asked for one by hand, which is how this was found.
 *
 * Typed, never picked from this crew's register pool: the model comes from the
 * other crew, so it is usually outside this faction and keyword and would not
 * be in that list. The player is holding its card.
 *
 * Collapsed by default. It happens about once a campaign, if that.
 */
export default function DefectorJoin({ onAdd }) {
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [injuries, setInjuries] = useState([])
  const [kit, setKit] = useState([])

  const ready = name.trim() && cost !== '' && Number.isFinite(Number(cost))

  const toggle = (inj) => setInjuries((list) => (
    list.some((i) => i.name === inj.name) ? list.filter((i) => i.name !== inj.name) : [...list, inj]
  ))

  function add() {
    if (!ready) return
    onAdd({ name: name.trim(), cost: Number(cost), injuries, equipment: kit })
    setName(''); setCost(''); setInjuries([]); setKit([])
  }

  return (
    <details className="repair noprint">
      <summary>A model defected to your crew (Traitor)</summary>

      <p className="gap-note">
        <strong>Traitor, p. 34.</strong> When your opponent flips the black
        joker for one of their models, it leaves their arsenal and your crew may
        add a copy <strong>for no scrip</strong>. It takes your leader’s
        keywords, and keeps the injuries and equipment it had that game. Their
        app removes it from their side. This adds it to yours. It is not your
        hire for the week and does not use the first-hire discount.
      </p>

      <Field>
        <Label>The model</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, as on its card" />
        <Input
          value={cost}
          onChange={(e) => setCost(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Its cost in soulstones"
          inputMode="numeric"
          style={{ marginTop: 8 }}
        />
        <p className="note">The cost counts toward your arsenal’s rating. You pay nothing for it.</p>
      </Field>

      <Field>
        <Label>Injuries it already had</Label>
        {INJURIES.map((inj) => (
          <label key={inj.name} className="hire__check">
            <input
              type="checkbox"
              checked={injuries.some((i) => i.name === inj.name)}
              onChange={() => toggle(inj)}
            />
            {inj.name} <span className="note">p.{inj.page}</span>
          </label>
        ))}
      </Field>

      <Field>
        <Label>Equipment it had that game</Label>
        <Select
          value=""
          onChange={(e) => {
            const item = KIT.find((k) => k.id === e.target.value)
            if (item) setKit((list) => [...list, item])
          }}
        >
          <option value="">Add an item…</option>
          {KIT.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </Select>
        {kit.map((k, i) => (
          <p key={`${k.id}:${i}`} className="note">
            {k.name}{' '}
            <Button ghost onClick={() => setKit((list) => list.filter((_, j) => j !== i))}>Remove</Button>
          </p>
        ))}
      </Field>

      <Button onClick={add} disabled={!ready}>
        Add {name.trim() || 'the model'} for no scrip
      </Button>
    </details>
  )
}
