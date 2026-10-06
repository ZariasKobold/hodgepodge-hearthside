import { useState } from 'react'
import { Label, Field, Button } from './ui.jsx'
import {
  crewSummary, sessionFor, sessionStage, sizeDisagreement,
} from '../lib/sharedCrew.js'

/**
 * The shared half of hiring: two players, each hidden from the other until
 * both have revealed (p. 19). Phase B of the crew builder.
 *
 * Rendered inside the Crew tab, above the crew itself. It never owns the crew:
 * the crew is hired locally (`lib/encounter.js`) and this only sends the
 * finished summary across, once. If the service cannot be reached, the panel
 * says so and the crew underneath carries on working (§6).
 */
export default function SharedCrewPanel({ encounter, arsenal, leader, shared, ready, onLinked, onRevealed }) {
  const [error, setError] = useState(null)
  const session = sessionFor(encounter, shared.sessions)
  const stage = sessionStage(session)
  const them = encounter.opponent?.name || session?.theirs?.nickname || 'your opponent'

  const run = async (fn) => {
    setError(null)
    try { await fn() } catch (err) { setError(err.message) }
  }

  /* Not linked yet: offer it when the opponent sits at this table. */
  if (!encounter.sharedId) {
    if (!shared.available || !encounter.opponent?.arsenalId) return null
    return (
      <Field>
        <Label>Hire together</Label>
        <p className="note">
          {them} can hire at the same time on their own device. Neither of you
          sees the other&rsquo;s crew until you have both revealed, the way the
          book plays it (p. 19).
        </p>
        <Button
          ghost
          disabled={shared.busy}
          onClick={() => run(async () => {
            const { id } = await shared.open({
              arsenalId: arsenal.id,
              opponentArsenalId: encounter.opponent.arsenalId,
              week: encounter.week,
            })
            onLinked(id)
          })}
        >
          Invite {them} to hire with you
        </Button>
        {error && <p className="note note--warn">{error} Your crew is safe here either way.</p>}
      </Field>
    )
  }

  if (!shared.available) {
    return (
      <p className="gap-note">
        <strong>This crew is part of a shared game</strong>, and the campaign
        service is not reachable from here. Keep hiring; you can reveal once you
        are back online.
      </p>
    )
  }

  const theirs = session?.theirs?.crew
  const mismatch = sizeDisagreement(encounter, arsenal, session)

  return (
    <Field>
      <Label>Hiring with {them}</Label>

      {stage === 'gone' && (
        <p className="note">
          {shared.error
            ? `Cannot check the shared game right now: ${shared.error}`
            : 'Looking for the shared game…'}
        </p>
      )}
      {stage === 'hiring' && <p className="note">{them} is still hiring. Neither crew is visible yet.</p>}
      {stage === 'theirs-ready' && (
        <p className="note"><strong>{them} has revealed</strong> and is waiting on you. Their crew stays hidden until yours is in.</p>
      )}
      {stage === 'waiting' && (
        <p className="note">Your crew is revealed and locked. Waiting on {them}; this checks every few seconds.</p>
      )}
      {stage === 'left' && (
        <p className="note note--warn">{them} has left this shared game. Your crew is still here to play or start over.</p>
      )}

      {(stage === 'hiring' || stage === 'theirs-ready') && (
        <>
          <Button
            disabled={!ready || shared.busy}
            onClick={() => run(async () => {
              await shared.reveal(encounter.sharedId, crewSummary(encounter, arsenal, leader))
              onRevealed()
            })}
          >
            Reveal my crew
          </Button>
          <p className="note">
            {ready
              ? 'Revealing locks this crew. It cannot be changed once it is in, so the other side cannot be answered after you have seen it.'
              : 'Finish the crew below first: an encounter size, and nothing over it.'}
          </p>
        </>
      )}

      {stage === 'both' && session.theirs.left && (
        <p className="note">{them} has recorded the game. Their crew stays here until you record yours.</p>
      )}

      {stage === 'both' && theirs && (
        <div className="shared crew__theirs">
          <div className="shared__who">{them}</div>
          <h3 className="shared__leader">
            {theirs.leader || 'Their leader'}{theirs.totem ? ` and ${theirs.totem}` : ''}
          </h3>
          <div className="hire__ledger shared__ledger">
            <span><strong>{theirs.cost}</strong>ss hired</span>
            <span>encounter <strong>{theirs.encounterSize ?? '—'}</strong></span>
            <span>rating <strong>{theirs.rating}</strong></span>
          </div>
          <ul className="hire__list">
            {theirs.models.map((m, i) => (
              <li key={i}><span>{m.name}</span><span className="hire__paid">{m.cost}ss{m.taxed ? ' (+1)' : ''}</span></li>
            ))}
            {theirs.models.length === 0 && <li><span>The leader alone</span><span /></li>}
          </ul>
          {theirs.equipment.length > 0 && (
            <ul className="hire__list">
              {theirs.equipment.map((e, i) => (
                <li key={i}><span>{e.name}</span><span className="hire__paid">{e.holder}</span></li>
              ))}
            </ul>
          )}
          {theirs.strategy && <p className="note">Strategy: {theirs.strategy}</p>}
        </div>
      )}

      {mismatch && (
        <p className="gap-note">
          <strong>You hired to different sizes:</strong> {mismatch.mine}ss here,
          {' '}{mismatch.theirs}ss for {them}. Agree one before you play.
        </p>
      )}

      {error && <p className="note note--warn">{error}</p>}
    </Field>
  )
}
