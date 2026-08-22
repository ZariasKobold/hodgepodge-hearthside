import { useState } from 'react'
import { SLOTS, slotLabel } from '../../data/archetypes.js'
import { getEffect } from '../../data/crewCards.js'
import { factionLabel } from '../../data/factions.js'
import { totalFor, liveModels, activeInjuryCount, STARTING_ARSENAL_WEEK } from '../../lib/campaignShape.js'
import { exportJSON } from '../../lib/storage.js'
import { buildSheet, sheetToPNG, printSheet } from '../../lib/recordImage.js'
import { Label, Button } from '../ui.jsx'
import LeaderRecord from '../LeaderRecord.jsx'
import CrewCards from '../CrewCards.jsx'

/**
 * Everything this leader has, in one place.
 *
 * The standing view of a campaign: who the leader is, what they have collected,
 * and what those models actually do. It grows as the campaign does — the roster
 * is grouped by when each model arrived, so week eight reads as a history
 * rather than a list.
 *
 * Deliberately read-only about the roster. Models arrive through the starting
 * arsenal (creation) or the weekly hire (campaign), and leave by annihilation.
 * A delete button here would imply a fourth route that the rules do not have.
 */
export default function Arsenal({ arsenal, leader, archetype, week, rules, fileNumber, onEditLeader, onHire }) {
  const [imaging, setImaging] = useState(null)

  const models = liveModels(arsenal)
  const lost = arsenal.models.filter((m) => m.annihilated)
  const effect = getEffect(leader.crewCard.effect)
  const stem = (leader.name || 'leader').toLowerCase().replace(/\s+/g, '-')

  // Starting arsenal first, then each week that actually saw a hire. Weeks with
  // nothing bought are simply absent rather than rendered empty.
  const weeks = [...new Set(models.map((m) => m.addedWeek ?? STARTING_ARSENAL_WEEK))].sort((a, b) => a - b)

  const saveImage = async () => {
    setImaging('working')
    try {
      await sheetToPNG(
        buildSheet({
          leader, archetype,
          factionLabel: factionLabel(leader.faction),
          fileNumber, slots: SLOTS, slotLabel, effect,
          cardFor: rules.card,
        }),
        `${stem}.png`
      )
      setImaging(null)
    } catch (err) {
      setImaging(String(err.message || err))
    }
  }

  return (
    <>
      <div className="hire__ledger noprint">
        <span>week <strong>{week}</strong></span>
        <span><strong>{arsenal.scrip}</strong> scrip</span>
        <span><strong>{totalFor(arsenal)}</strong> soulstones</span>
        <span>{models.length} {models.length === 1 ? 'model' : 'models'}</span>
        {activeInjuryCount(arsenal) > 0 && <span><strong>{activeInjuryCount(arsenal)}</strong> injuries</span>}
      </div>

      <LeaderRecord leader={leader} archetype={archetype} fileNumber={fileNumber} rules={rules} />

      <div className="export noprint">
        <Button onClick={onEditLeader}>Edit this leader</Button>
        <Button ghost onClick={onHire}>Weekly hire</Button>
        <Button ghost onClick={() => exportJSON(arsenal, `${stem}.json`)}>Export JSON</Button>
        <Button ghost onClick={saveImage} disabled={imaging === 'working'}>
          {imaging === 'working' ? 'Drawing…' : 'Export image'}
        </Button>
        <Button ghost onClick={printSheet}>Export PDF</Button>
      </div>
      {imaging && imaging !== 'working' && <p className="note note--warn noprint">{imaging}</p>}

      <section className="noprint" style={{ marginTop: 28 }}>
        <div className="slot__head">
          <Label>The arsenal</Label>
          <span className="tally">{totalFor(arsenal)}ss across {models.length}</span>
        </div>

        {models.length === 0 && (
          <div className="empty">
            Nothing hired yet. The starting arsenal is bought on the last step of
            creation; after that, models arrive through the weekly hire.
          </div>
        )}

        {weeks.map((w) => {
          const inWeek = models.filter((m) => (m.addedWeek ?? STARTING_ARSENAL_WEEK) === w)
          return (
            <div key={w} style={{ marginBottom: 16 }}>
              <Label>
                {w === STARTING_ARSENAL_WEEK ? 'Starting arsenal' : `Week ${w}`}
                {' — '}{inWeek.reduce((sum, m) => sum + (m.cost || 0), 0)}ss
              </Label>
              {inWeek.map((m) => (
                <div className="pick" key={m.id} style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
                  <span className="pick__meta" style={{ fontSize: 13, color: 'var(--text)' }}>{m.name}</span>
                  <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {w !== STARTING_ARSENAL_WEEK && (
                      <span className="pick__meta">{m.scripPaid} scrip</span>
                    )}
                    <span className="pick__meta">{m.cost}ss</span>
                  </span>
                </div>
              ))}
            </div>
          )
        })}

        {lost.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Label>Annihilated — no longer hirable</Label>
            {lost.map((m) => (
              <div className="pick" key={m.id} style={{ borderColor: 'var(--oxide-dim)', background: 'var(--panel)', opacity: 0.7 }}>
                <span className="pick__meta" style={{ fontSize: 13 }}>{m.name}</span>
                <span className="pick__meta">{m.cost}ss</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {arsenal.models.length > 0 && <CrewCards models={models} rules={rules} />}
    </>
  )
}
