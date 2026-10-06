import { useState } from 'react'
import { SLOTS, slotLabel } from '../../data/archetypes.js'
import { getEffect } from '../../data/crewCards.js'
import { factionLabel } from '../../data/factions.js'
import {
  totalFor, liveModels, liveEquipment, activeInjuryCount, STARTING_ARSENAL_WEEK,
} from '../../lib/shape/arsenal.js'
import { exportJSON } from '../../lib/storage.js'
import { buildSheet, sheetToPNG, printSheet } from '../../lib/recordImage.js'
import { Label, Button } from '../ui.jsx'
import LeaderRecord from '../LeaderRecord.jsx'
import CrewCards from '../CrewCards.jsx'
import UnplacedAdvancements from '../UnplacedAdvancements.jsx'
import RepairAftermath from '../RepairAftermath.jsx'
import KeptTriggerRepair from '../KeptTriggerRepair.jsx'
import TotemCard from '../TotemCard.jsx'

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
 *
 * Equipment is the exception, because the book gives it a route the app cannot
 * see. Some kit annihilates itself during a game (Lucky Gremlin Foot, p. 22),
 * and only the player knows when. So each piece has an Annihilate control, and
 * it flags the row rather than deleting it (audit v0.28.1 M3).
 */
export default function Arsenal({
  campaign, arsenal, leader, archetype, week, rules, fileNumber,
  onEditLeader, onHire, onSheet, onPlaceAdvancement, onRepairDrift, onSetTrigger, onSetTotem,
  onAnnihilateEquipment,
}) {
  const [imaging, setImaging] = useState(null)
  /** Which action each unplaced advancement is about to be given. */
  const [placing, setPlacing] = useState({})
  /** The equipment row whose annihilation is waiting to be confirmed. */
  const [confirming, setConfirming] = useState(null)

  const models = liveModels(arsenal)
  const lost = arsenal.models.filter((m) => m.annihilated)
  const kit = liveEquipment(arsenal)
  const lostKit = (arsenal.equipment || []).filter((e) => e.annihilated)
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

      {leader.annihilatedWeek != null && (
        // A gap-note, not Hank: it is a fact about the rules (§5).
        <p className="gap-note">
          <strong>{leader.name || 'This leader'} was annihilated in week{' '}
          {leader.annihilatedWeek}.</strong>{' '}
          Fate had already stepped in once, so the result stands (p. 19). The
          book says to retire this crew and start anew (p. 37): a new arsenal,
          with 5 extra scrip for every week the campaign has run past the first.
          This record stays as it was, so the campaign's story is still readable.
        </p>
      )}

      <LeaderRecord leader={leader} archetype={archetype} fileNumber={fileNumber} rules={rules} />

      {/* Above the advancement repair, because it is the bigger claim: this one
          says the arsenal on screen is *wrong*, while that one says a line on it
          is incomplete. Fixing this first also changes what that one has to
          offer, since restored advancements may themselves need a target. */}
      <RepairAftermath
        arsenal={arsenal}
        campaign={campaign}
        onRepair={onRepairDrift}
      />

      {/* Sits under the record rather than above it, because the record is what
          the repair is *for*: you name the action, and the line moves out of
          the catch-all list and up onto the card a few inches above. */}
      <KeptTriggerRepair leader={leader} onSetTrigger={onSetTrigger} />

      {onPlaceAdvancement && (
        <UnplacedAdvancements
          arsenal={arsenal}
          leader={leader}
          rules={rules}
          draft={placing}
          onDraft={(id, value) => setPlacing((d) => ({ ...d, [id]: value }))}
          onPlace={(at, appliesTo, opts) => {
            onPlaceAdvancement(at, appliesTo, opts)
            // Drafts are keyed `${to}:${at}` (and `…:row`), not by the bare
            // index — deleting `at` alone left the old answer waiting to be
            // pre-selected for whatever lands on that index next.
            const id = `${opts?.to || 'leader'}:${at}`
            setPlacing((d) => {
              const next = { ...d }
              delete next[id]
              delete next[`${id}:row`]
              delete next[`${id}:move`]
              return next
            })
          }}
        />
      )}

      <div className="export noprint">
        <Button onClick={onEditLeader}>Edit this leader</Button>
        {onSheet && <Button ghost onClick={onSheet}>Arsenal sheet</Button>}
        <Button ghost onClick={onHire}>Weekly hire</Button>
        {/* The campaign, not the arsenal. An arsenal has no `arsenals` array,
            so `adopt` refused every file this button used to produce — a backup
            the app itself could not read (audit v0.11.0, H2). */}
        <Button ghost onClick={() => exportJSON(campaign, `${stem}.json`)}>Export JSON</Button>
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

        <div style={{ marginTop: 10 }}>
          <Label>Equipment</Label>
          {kit.length === 0 ? (
            <div className="empty">
              No equipment. It is bought at the barter counter in the aftermath.
            </div>
          ) : kit.map((e) => (
            <div className="pick" key={e.id} style={{ borderColor: 'var(--line)', background: 'var(--panel)' }}>
              <span className="pick__meta" style={{ fontSize: 13, color: 'var(--text)' }}>{e.name}</span>
              <span style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                {e.page && <span className="pick__meta">p.{e.page}</span>}
                {onAnnihilateEquipment && (confirming === e.id ? (
                  <>
                    <Button ghost onClick={() => { onAnnihilateEquipment(e.id, true); setConfirming(null) }}>
                      Yes, it is gone
                    </Button>
                    <Button ghost onClick={() => setConfirming(null)}>Keep it</Button>
                  </>
                ) : (
                  <Button ghost onClick={() => setConfirming(e.id)}>Annihilate</Button>
                ))}
              </span>
            </div>
          ))}
          {kit.length > 0 && (
            <p className="note">
              Only for kit annihilated during a game. It cannot be used until it
              is bought again (p. 22), and no scrip comes back.
            </p>
          )}
        </div>

        {lostKit.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Label>Annihilated equipment — buy again to use</Label>
            {lostKit.map((e) => (
              <div className="pick" key={e.id} style={{ borderColor: 'var(--coal-wash)', background: 'var(--panel)', opacity: 0.7 }}>
                <span className="pick__meta" style={{ fontSize: 13 }}>
                  {e.name}{e.annihilatedWeek != null && ` · week ${e.annihilatedWeek}`}
                </span>
                {onAnnihilateEquipment && (
                  <Button ghost onClick={() => onAnnihilateEquipment(e.id, false)}>Undo</Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Its own category, and never one of the weeks.
            A totem is not hired and has no scrip price: it arrives from the
            tier-3 advancement table (p.52), the crew may have exactly one, and
            it is taken for free at each encounter like a totem in an ordinary
            game. Filing it under the week it appeared would put it in the
            ledger beside models that cost scrip, and counting its stones into
            the arsenal total would inflate the encounter cap it has no business
            touching. */}
        <div style={{ marginTop: 10 }}>
          <Label>Totem</Label>
          {arsenal.totem ? (
            <TotemCard totem={arsenal.totem} onSetTotem={onSetTotem} />
          ) : (
            <div className="empty">
              No totem. There is no way to hire one — a totem comes from the
              tier-3 Totem Advancement in the aftermath, and only while you have
              none. Once you have it, later advancements may go to it instead of
              to your leader.
            </div>
          )}
        </div>

        {lost.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Label>Annihilated — no longer hirable</Label>
            {lost.map((m) => (
              <div className="pick" key={m.id} style={{ borderColor: 'var(--coal-wash)', background: 'var(--panel)', opacity: 0.7 }}>
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
