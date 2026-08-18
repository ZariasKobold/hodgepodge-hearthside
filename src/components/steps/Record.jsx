import { SLOTS, slotLabel } from '../../data/archetypes.js'
import { getEffect } from '../../data/crewCards.js'
import { factionLabel } from '../../data/factions.js'
import { arsenalTotal, startingScrip, STARTING_SOULSTONES } from '../../lib/campaign.js'
import { exportJSON } from '../../lib/storage.js'
import { Label, Button, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import { CREATION, sendOff } from '../../data/hank.js'

export default function Record({ leader, set, archetype, roster, fileNumber }) {
  const spent = arsenalTotal(leader.arsenal)
  const scrip = startingScrip(spent)
  const over = spent > STARTING_SOULSTONES
  const effect = getEffect(leader.crewCard.effect)

  const addModel = (slug) => {
    const model = roster.models.find((m) => m.slug === slug)
    if (!model) return
    set({ arsenal: [...leader.arsenal, { slug: model.slug, name: model.name, cost: model.cost }] })
  }

  const dropModel = (index) =>
    set({ arsenal: leader.arsenal.filter((_, i) => i !== index) })

  return (
    <>
      <article className="record">
        <div className="record__head">
          <span className="record__eyebrow">
            {factionLabel(leader.faction)} · {archetype.name}
          </span>
          <span className="record__file">{fileNumber}</span>
        </div>

        <h2 className="record__name">{leader.name}</h2>
        <div className="record__line">
          {leader.keywords.filter(Boolean).join(' / ')} · {leader.advancementPath} · Sz {leader.size} ·{' '}
          {leader.base}mm{leader.characteristics.length ? ` · ${leader.characteristics.join(', ')}` : ''} · master
        </div>

        <div className="record__stats">
          {[['Df', archetype.stats.df], ['Wp', archetype.stats.wp], ['Sp', archetype.stats.sp], ['Health', archetype.stats.health]].map(
            ([k, v]) => (
              <div key={k}>
                <div className="record__stat-k">{k}</div>
                <div className="record__stat-v">{v}</div>
              </div>
            )
          )}
        </div>

        {SLOTS.map((slot) =>
          leader.picks[slot].length > 0 ? (
            <section className="record__section" key={slot}>
              <div className="record__section-k">{slotLabel(slot)}</div>
              {leader.picks[slot].map((p) => (
                <div className="record__entry" key={p.key}>
                  {p.name} <span>— from {p.model}, {p.cost}ss</span>
                </div>
              ))}
            </section>
          ) : null
        )}

        {leader.trigger && (
          <section className="record__section">
            <div className="record__section-k">Trigger</div>
            <div className="record__entry">{leader.trigger}</div>
          </section>
        )}

        {effect && (
          <section className="record__section">
            <div className="record__section-k">Crew card</div>
            <div className="record__entry">
              {effect.name}
              {leader.crewCard.choice ? <span> — {leader.crewCard.choice}</span> : null}
            </div>
          </section>
        )}

        {archetype.freeEquipment && (
          <section className="record__section">
            <div className="record__section-k">Equipment</div>
            <div className="record__entry">
              One free upgrade by uncheatable flip <span>— returned to the arsenal if annihilated</span>
            </div>
          </section>
        )}

        <div className="record__foot">
          Rules text lives on your cards. This record holds names and costs only.
        </div>
      </article>

      <section style={{ marginTop: 28 }}>
        <HankSays>{CREATION.arsenal}</HankSays>
        <div className="slot__head">
          <Label>Starting arsenal — {STARTING_SOULSTONES} soulstones, leader costs nothing</Label>
          <span className={`tally${over ? ' tally--over' : ''}`}>
            {spent}/{STARTING_SOULSTONES} spent · {scrip} scrip
          </span>
        </div>

        {leader.arsenal.map((m, i) => (
          <div className="pick" key={`${m.slug}-${i}`} style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
            <span className="pick__meta" style={{ fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span className="pick__meta">{m.cost}ss</span>
              <button className="pick__drop" onClick={() => dropModel(i)}>REMOVE</button>
            </span>
          </div>
        ))}

        {roster.models.length > 0 ? (
          <Select value="" onChange={(e) => addModel(e.target.value)} style={{ marginTop: 8 }}>
            <option value="">Add a model…</option>
            {[...roster.models].sort((a, b) => a.cost - b.cost).map((m) => (
              <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
            ))}
          </Select>
        ) : (
          <div className="empty" style={{ marginTop: 8 }}>
            Load the register on the loadout step to hire from your keywords.
          </div>
        )}

        {over && (
          <p className="note note--warn">
            Over budget by {spent - STARTING_SOULSTONES}ss. Drop something before the first game.
          </p>
        )}
      </section>

      <HankSays>{sendOff({})}</HankSays>

      <div style={{ marginTop: 26 }}>
        <Button
          ghost
          onClick={() =>
            exportJSON(leader, `${(leader.name || 'leader').toLowerCase().replace(/\s+/g, '-')}.json`)
          }
        >
          Export record
        </Button>
      </div>
    </>
  )
}
