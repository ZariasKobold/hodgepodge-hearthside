import { useState, useRef } from 'react'
import { factionLabel } from '../data/factions.js'
import { getArchetype } from '../data/archetypes.js'
import { myArsenal, currentWeek, totalFor, liveModels } from '../lib/campaignShape.js'
import { importJSON, exportJSON } from '../lib/storage.js'
import { Button, Label } from './ui.jsx'
import HankSays from '../components/HankSays.jsx'
import { CREATION } from '../data/hank.js'

/**
 * The shelf — every leader this browser holds, one card each.
 *
 * This is the landing screen once anything is saved, because after week one the
 * question is "which of my campaigns am I here for", not "let's build someone".
 * Before anything is saved there is nothing to choose between, so App drops
 * straight into creation instead.
 *
 * Everything on a card is read from the campaign at render. Nothing is copied
 * into an index, so renaming a leader shows here immediately rather than after
 * whatever would have refreshed the copy.
 */
function LeaderCard({ campaign, onOpen, onExport, onDiscard }) {
  const arsenal = myArsenal(campaign)
  if (!arsenal) return null

  const { leader } = arsenal
  const archetype = getArchetype(leader.archetype)
  const week = currentWeek(campaign)
  const models = liveModels(arsenal)
  const keywords = (arsenal.keywords || []).filter(Boolean)

  // A leader with no name yet is still a real campaign — someone stopped
  // partway. Say so rather than rendering a blank card.
  const named = leader.name?.trim()

  return (
    <article className="leafcard">
      <div className="leafcard__head">
        <span className="record__eyebrow">
          {arsenal.faction ? factionLabel(arsenal.faction) : 'No faction yet'}
          {archetype ? ` · ${archetype.name}` : ''}
        </span>
        <span className="record__file">Week {week} of {campaign.weeksTotal}</span>
      </div>

      <h3 className={`leafcard__name${named ? '' : ' leafcard__name--blank'}`}>
        {named || 'Unnamed leader'}
      </h3>

      <div className="leafcard__line">
        {keywords.length ? keywords.join(' / ') : 'no keywords chosen'}
      </div>

      <div className="leafcard__tally">
        <span>{models.length} {models.length === 1 ? 'model' : 'models'}</span>
        <span>{totalFor(arsenal)}ss</span>
        <span>{arsenal.scrip} scrip</span>
      </div>

      <div className="leafcard__actions">
        <Button onClick={() => onOpen(campaign.id)}>View arsenal</Button>
        <button className="gate__link" onClick={() => onExport(campaign)}>Export</button>
        <button className="gate__link leafcard__drop" onClick={() => onDiscard(campaign)}>Discard</button>
      </div>
    </article>
  )
}

export default function ArsenalLibrary({ shelf, onOpen, onNew, onImport, onDiscard }) {
  const [error, setError] = useState(null)
  const [pendingDiscard, setPendingDiscard] = useState(null)
  const fileRef = useRef(null)

  const exportOne = (campaign) => {
    const arsenal = myArsenal(campaign)
    const stem = (arsenal?.leader?.name || 'campaign').toLowerCase().replace(/\s+/g, '-')
    exportJSON(campaign, `${stem}.json`)
  }

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    // Reset immediately, so picking the same file twice in a row still fires.
    event.target.value = ''
    if (!file) return
    setError(null)
    try {
      onImport(await importJSON(file))
    } catch (err) {
      setError(String(err.message || err))
    }
  }

  return (
    <>
      <HankSays>{CREATION.identity}</HankSays>

      <div className="slot__head">
        <Label>Your leaders — one campaign each</Label>
        <span className="tally">{shelf.length} on file</span>
      </div>

      {shelf.length === 0 && (
        <div className="empty" style={{ marginBottom: 18 }}>
          Nothing on the shelf yet. Build a leader, or bring one in from a JSON
          export.
        </div>
      )}

      {shelf.map((campaign) => (
        <LeaderCard
          key={campaign.id}
          campaign={campaign}
          onOpen={onOpen}
          onExport={exportOne}
          onDiscard={setPendingDiscard}
        />
      ))}

      {/* Discarding is the one destructive thing on this screen and there is no
          undo, so it asks — and it names who it is about to throw away. */}
      {pendingDiscard && (
        <div className="gap-note">
          <strong>Discard {myArsenal(pendingDiscard)?.leader?.name || 'this leader'}?</strong>{' '}
          This removes the campaign from this browser and cannot be undone. Export
          it first if you might want it back.
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <Button
              onClick={() => { onDiscard(pendingDiscard.id); setPendingDiscard(null) }}
            >
              Discard it
            </Button>
            <Button ghost onClick={() => exportOne(pendingDiscard)}>Export first</Button>
            <Button ghost onClick={() => setPendingDiscard(null)}>Keep it</Button>
          </div>
        </div>
      )}

      <div className="export">
        <Button onClick={onNew}>Build a new leader</Button>
        <Button ghost onClick={() => fileRef.current?.click()}>Import from JSON</Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={chooseFile}
          style={{ display: 'none' }}
        />
        <span className="label" style={{ margin: 0 }}>
          An import is filed as a new leader — nothing here is overwritten.
        </span>
      </div>

      {error && <p className="note note--warn">{error}</p>}
    </>
  )
}
