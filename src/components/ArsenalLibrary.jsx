import { useState, useRef } from 'react'
import { factionLabel } from '../data/factions.js'
import { getArchetype } from '../data/archetypes.js'
import { myArsenal, currentWeek, totalFor, liveModels } from '../lib/campaignShape.js'
import { importJSON, exportJSON } from '../lib/storage.js'
import { deleteAccount } from '../lib/remote.js'
import { forgetUser } from '../lib/session.js'
import { Button, Label } from './ui.jsx'
import HankSays from '../components/HankSays.jsx'
import { CREATION } from '../data/hank.js'

/** Where the data actually is — see the note in the shelf below. */
function SyncLine({ sync, count, offlineSession }) {
  if (sync.status === 'syncing') {
    return <p className="note">Checking your account for campaigns…</p>
  }

  /**
   * Signed in, but working from a remembered session because the service
   * cannot be reached. Distinct from being signed out, and it has to say so —
   * the work is safe and will sync, which is the opposite of the warning
   * below it.
   */
  if (sync.status === 'offline' && offlineSession) {
    return (
      <p className="note">
        Working offline. {count === 1 ? 'This campaign is' : `These ${count} campaigns are`}{' '}
        saved on this device and will sync to your account when the service is
        reachable again.
      </p>
    )
  }

  if (sync.status === 'offline') {
    return (
      <p className="note note--warn">
        Not signed in to sync.{' '}
        {count === 1 ? 'This campaign is' : `These ${count} campaigns are`} saved in{' '}
        <strong>this browser only</strong> — clearing your history loses{' '}
        {count === 1 ? 'it' : 'them'}. Export the JSON to keep a copy.
      </p>
    )
  }

  if (sync.status === 'failed') {
    return (
      <p className="note note--warn">
        Saved here, but not to your account — {sync.error} These campaigns are
        safe in this browser and will sync when the service is reachable.{' '}
        <button className="gate__link" onClick={sync.reconcile}>Try again</button>
      </p>
    )
  }

  if (sync.status === 'synced') {
    const bits = []
    if (sync.adopted > 0) bits.push(`${sync.adopted} added to your account`)
    if (sync.pulled > 0) bits.push(`${sync.pulled} pulled from it`)
    return (
      <p className="note">
        Synced to your account{bits.length ? ` — ${bits.join(', ')}` : ''}. These
        follow you to another device.
      </p>
    )
  }

  return null
}

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
    <article className={`leafcard${leader.portrait ? ' leafcard--hasart' : ''}`}>
      {leader.portrait && (
        <img className="leafcard__portrait" src={leader.portrait} alt="" />
      )}
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
export default function ArsenalLibrary({ shelf, onOpen, onNew, onImport, onDiscard, sync, signedIn, offlineSession }) {
  const [error, setError] = useState(null)
  const [pendingDiscard, setPendingDiscard] = useState(null)
  const [erasing, setErasing] = useState(false)
  const fileRef = useRef(null)

  const eraseAccount = async () => {
    setError(null)
    try {
      await deleteAccount()
      // Nothing of theirs should survive on this device either — the point of
      // the button is that the data is gone, not that it is gone from one of
      // two places.
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('hodgepodge:campaign')) localStorage.removeItem(key)
      }
      // Including the remembered session, or the next load would let the
      // deleted account back in offline.
      forgetUser()
      window.location.href = '/'
    } catch (err) {
      setErasing(false)
      setError(String(err.message || err))
    }
  }

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

      {/* Where the data actually is, said plainly. The app used to claim a
          campaign was "filed against an account" while it sat only in this
          browser; the cure for that is not quieter wording, it is telling the
          truth on the screen where the campaigns are. */}
      {sync && <SyncLine sync={sync} count={shelf.length} offlineSession={offlineSession} />}

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

      {/* The whole of the personal data this project holds, and the control
          that removes it. Kept quiet and at the bottom — it is not a thing
          anyone should hit on the way to something else. */}
      {signedIn && (
        <section className="privacy">
          <p className="privacy__line">
            Signed in with Discord. This app stores your Discord id, display name
            and avatar — no email, no password, no tokens; there are no columns
            for them.{' '}
            {erasing ? null : (
              <button className="gate__link leafcard__drop" onClick={() => setErasing(true)}>
                Delete my account and all campaigns
              </button>
            )}
          </p>

          {erasing && (
            <div className="gap-note">
              <strong>Erase everything?</strong> This removes your account, every
              campaign on it, and the copies in this browser. It cannot be undone
              and there is no backup but yours.
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                <Button onClick={eraseAccount}>Erase it all</Button>
                <Button ghost onClick={() => shelf.forEach(exportOne)}>
                  Export everything first
                </Button>
                <Button ghost onClick={() => setErasing(false)}>Keep my account</Button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  )
}
