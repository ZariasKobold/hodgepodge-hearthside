import { useState } from 'react'
import { Button, Input, Select } from './ui.jsx'
import { totemPicks, totemRow, advancementsOn, advancedAction, gainedActionKey } from '../lib/advancement.js'
import { advancementKey, entryFor } from '../lib/book.js'
import { useBookText } from '../hooks/useBook.js'
import BookText, { BookEntry } from './BookText.jsx'

/**
 * The totem on the Arsenal view: what it is, and what it can do.
 *
 * Until v0.29.3 this was a name and an advancement count. A player who gained
 * one reported that it "has absolutely zero actions and abilities. It just...
 * exists" — because the app had kept its stats off pp. 52–53 and not its
 * starting abilities and actions. Those are on its row of the totem table, and
 * `totemPicks` reads them from there on every render.
 *
 * Since v0.37.0 each one also says what it does, read from BiggerHat where the
 * register carries it and from the book otherwise (`lib/book.js`).
 */
export default function TotemCard({ totem, onSetTotem }) {
  const row = totemRow(totem)
  const own = totemPicks(totem)
  const gained = (totem.advancements || []).filter((a) => a.tableId === 'action')
  const page = row?.page ?? 52
  const totemKey = row ? advancementKey('totem', row) : null
  const book = useBookText([totemKey, ...gained.map((a) => advancementKey(a.tableId, a))])
  const printed = entryFor(book, totemKey)
  /** The totem row's own text for one of its parts, matched by name. */
  const partText = (kind, name) => {
    const list = kind === 'ability' ? printed?.abilities : printed?.actions
    return (list || []).find((p) => sameName(p?.name, name)) || null
  }

  const line = (pick) => {
    const { stat, statChanged, triggers } = advancedAction(pick.base, advancementsOn(totem, pick.key))
    const all = [...(pick.triggers || []), ...triggers.map((t) => t.name)]
    return (
      <li key={pick.key}>
        {pick.name}
        {pick.base?.stat != null || statChanged ? ` · Skl ${stat}` : ''}
        {pick.base?.resistedBy ? ` vs ${pick.base.resistedBy}` : ''}
        {pick.chosen ? ' · chosen from a master' : ''}
        {all.length > 0 && <span className="pick__meta"> — {all.join(', ')}</span>}
        {!pick.chosen && <BookEntry entry={partText('action', pick.name)} />}
      </li>
    )
  }

  return (
    <div className="pick totem-card" style={{ borderColor: 'var(--brass)', background: 'var(--panel)', display: 'block' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <span className="pick__meta" style={{ fontSize: 13, color: 'var(--text)' }}>
          {totem.name}
        </span>
        <span className="pick__meta">free · 0ss · p.{page}</span>
      </div>

      {row ? (
        <div className="totem-card__body">
          <p className="pick__meta">
            Df {totem.stats.df} · Wp {totem.stats.wp} · Sp {totem.stats.sp} · Health {totem.stats.health}
          </p>
          <TotemList label="Abilities" items={own.ability.map((a) => <li key={a.key}>{a.name}<BookEntry entry={partText('ability', a.name)} /></li>)} />
          <TotemList label="Attack actions" items={own.attack.map(line)} />
          <TotemList label="Tactical actions" items={own.tactical.map(line)} />
          {gained.length > 0 && (
            <TotemList
              label="Gained by advancement"
              items={gained.map((a) => {
                const { triggers } = advancedAction(null, advancementsOn(totem, gainedActionKey(a)))
                return (
                  <li key={gainedActionKey(a)}>
                    {a.name}{a.page ? ` (p.${a.page})` : ''}
                    {triggers.length > 0 && <span className="pick__meta"> — {triggers.map((t) => t.name).join(', ')}</span>}
                    <BookText book={book} advancement={a} />
                  </li>
                )
              })}
            />
          )}
          {row.chooseAction && onSetTotem && (
            <MiniMasterChoice chosen={totem.chosenAction} onChoose={(chosenAction) => onSetTotem({ chosenAction })} />
          )}
          <BookEntry entry={printed} />
          {!printed && <p className="note">What each one does is on p.{page} of the book.</p>}
        </div>
      ) : (
        <p className="note">
          The app cannot match “{totem.name}” to a row of the totem table, so it
          cannot list what it does. Its card is on pp. 52–53.
        </p>
      )}
    </div>
  )
}

function TotemList({ label, items }) {
  return (
    <div className="totem-card__group">
      <span className="pick__meta">{label}</span>
      {items.length ? <ul className="totem-card__list">{items}</ul> : <span className="pick__meta"> none</span>}
    </div>
  )
}

/**
 * The red joker's totem gains "one action on a master that shares a keyword
 * with your leader ... without any triggers" (p. 53). The app cannot list a
 * master's actions without the register, so it is written in, like any action
 * the app cannot see.
 */
function MiniMasterChoice({ chosen, onChoose }) {
  const [name, setName] = useState(chosen?.name || '')
  const [kind, setKind] = useState(chosen?.kind || 'attack')
  const same = chosen && chosen.name === name.trim() && chosen.kind === kind
  return (
    <div className="totem-card__group">
      <span className="pick__meta">The Mini-Master’s chosen action (p.53)</span>
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="A master’s action, sharing a keyword with your leader" />
      <Select value={kind} onChange={(e) => setKind(e.target.value)} style={{ marginTop: 8 }}>
        <option value="attack">Attack action</option>
        <option value="tactical">Tactical action</option>
      </Select>
      <Button onClick={() => onChoose({ name: name.trim(), kind })} disabled={!name.trim() || same}>
        {chosen ? 'Change it' : 'Record it'}
      </Button>
    </div>
  )
}

/** Names as the book prints them and as the data file spells them: quotes aside. */
function sameName(a, b) {
  const plain = (s) => String(s || '').replace(/[‘’“”"']/g, '').toLowerCase().trim()
  return plain(a) === plain(b)
}
