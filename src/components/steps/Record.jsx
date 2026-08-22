import { useState, useEffect, useMemo } from 'react'
import { SLOTS, slotLabel } from '../../data/archetypes.js'
import { getEffect } from '../../data/crewCards.js'
import { factionLabel } from '../../data/factions.js'
import { arsenalTotal, startingScrip, STARTING_SOULSTONES } from '../../lib/campaign.js'
import { exportJSON } from '../../lib/storage.js'
import { sourceSlug } from '../../lib/rules.js'
import { isVersatile } from '../../lib/indexing.js'
import { buildSheet, sheetToPNG, printSheet } from '../../lib/recordImage.js'
import { Label, Button, Select, PrintLegal } from '../ui.jsx'
import { RulesState } from '../RulesText.jsx'
import CrewCards from '../CrewCards.jsx'
import HankSays from '../HankSays.jsx'
import { CREATION, sendOff } from '../../data/hank.js'

/** Cheapest first, so the picker reads as a shopping list. */
const byCost = (models) => [...models].sort((a, b) => a.cost - b.cost)

export default function Record({ leader, set, archetype, roster, rules, fileNumber }) {
  const spent = arsenalTotal(leader.arsenal)
  const scrip = startingScrip(spent)
  const over = spent > STARTING_SOULSTONES
  const effect = getEffect(leader.crewCard.effect)
  const [imaging, setImaging] = useState(null)

  /**
   * The selections come from at most a handful of models, so their text is
   * fetched without being asked for — unlike the arsenal, which grows all
   * campaign and stays behind a button.
   */
  const pickSlugs = useMemo(() => {
    const out = new Set()
    for (const slot of SLOTS) {
      for (const pick of leader.picks[slot] || []) {
        const slug = sourceSlug(pick)
        if (slug) out.add(slug)
      }
    }
    return [...out]
  }, [leader.picks])

  // Versatile models are hirable without sharing a keyword, so the picker
  // separates them. `isVersatile` is derived, never stored — the register owns
  // that fact and may change it.
  const versatileModels = useMemo(
    () => roster.models.filter(isVersatile),
    [roster.models]
  )
  const keywordModels = useMemo(
    () => roster.models.filter((m) => !isVersatile(m)),
    [roster.models]
  )

  const fingerprint = pickSlugs.join('|')
  useEffect(() => {
    pickSlugs.forEach((slug) => rules.ensure(slug))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, rules.ensure])

  const anyText = pickSlugs.some((slug) => rules.card(slug))
  const stem = (leader.name || 'leader').toLowerCase().replace(/\s+/g, '-')

  const addModel = (slug) => {
    const model = roster.models.find((m) => m.slug === slug)
    if (!model) return
    set({ arsenal: [...leader.arsenal, { slug: model.slug, name: model.name, cost: model.cost }] })
  }

  const dropModel = (index) =>
    set({ arsenal: leader.arsenal.filter((_, i) => i !== index) })

  /** Built at the moment of export so it always reflects what has arrived. */
  const saveImage = async () => {
    setImaging('working')
    try {
      const sheet = buildSheet({
        leader,
        archetype,
        factionLabel: factionLabel(leader.faction),
        fileNumber,
        slots: SLOTS,
        slotLabel,
        effect,
        cardFor: rules.card,
      })
      await sheetToPNG(sheet, `${stem}.png`)
      setImaging(null)
    } catch (err) {
      setImaging(String(err.message || err))
    }
  }

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
                <div className="record__written" key={p.key}>
                  <div className="record__entry">
                    {p.name} <span>— from {p.model}, {p.cost}ss</span>
                  </div>
                  <RulesState rules={rules} slug={sourceSlug(p)} slot={slot} name={p.name} quiet />
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
              <span> — {leader.crewCard.choice ? `${leader.crewCard.choice}, ` : ''}p.{effect.page}</span>
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
          {anyText
            ? 'Action and ability text is read live from BiggerHat and is not stored by this app. Your cards remain the authority.'
            : 'Rules text lives on your cards. This record holds names and costs only.'}
          <PrintLegal />
        </div>
      </article>

      <div className="export noprint">
        <Button ghost onClick={() => exportJSON(leader, `${stem}.json`)}>Export JSON</Button>
        <Button ghost onClick={saveImage} disabled={imaging === 'working'}>
          {imaging === 'working' ? 'Drawing…' : 'Export image'}
        </Button>
        <Button ghost onClick={printSheet}>Export PDF</Button>
        <span className="label" style={{ margin: 0 }}>
          PDF opens your print dialogue — choose “Save as PDF”.
        </span>
      </div>
      {imaging && imaging !== 'working' && <p className="note note--warn noprint">{imaging}</p>}

      <section style={{ marginTop: 28 }} className="noprint">
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
            {/* Grouped rather than merged, so a Versatile model appearing
                alongside your keyword models reads as a rule rather than a
                bug. Both groups are equally hirable. */}
            <optgroup label="From your keywords">
              {byCost(keywordModels).map((m) => (
                <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
              ))}
            </optgroup>
            {versatileModels.length > 0 && (
              <optgroup label={`Versatile — ${factionLabel(leader.faction)}`}>
                {byCost(versatileModels).map((m) => (
                  <option key={m.slug} value={m.slug}>{m.name} — {m.cost}ss</option>
                ))}
              </optgroup>
            )}
          </Select>
        ) : (
          <div className="empty" style={{ marginTop: 8 }}>
            Load the register on the loadout step to hire from your keywords and
            your faction's Versatile models.
          </div>
        )}

        {over && (
          <p className="note note--warn">
            Over budget by {spent - STARTING_SOULSTONES}ss. Drop something before the first game.
          </p>
        )}
      </section>

      {leader.arsenal.length > 0 && <CrewCards models={leader.arsenal} rules={rules} />}

      <HankSays>{sendOff({})}</HankSays>
    </>
  )
}
