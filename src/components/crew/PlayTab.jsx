import { useState } from 'react'
import { Label, Field, Button, Select } from '../ui.jsx'
import { openEncounter, crewCost } from '../../lib/encounter.js'
import { arsenalTotal } from '../../lib/campaign.js'
import { invitations } from '../../lib/sharedCrew.js'
import { selectionFromCrew } from '../../lib/crews.js'
import { strategyBySlug, schemeBySlug } from '../../lib/scenario.js'
import { useScenarioText } from '../../hooks/useScenarioText.js'
import { usePlay } from '../../hooks/usePlay.js'
import EncounterSetup, { ScenarioCard } from './EncounterSetup.jsx'
import PlayTracker from '../steps/PlayTracker.jsx'

/**
 * The Play tab: a game from setup to "Game over" (v0.34.0).
 *
 * With nothing open it offers a game: hire a new crew, or start from a saved
 * one, and any shared game a player at the table has asked you into. With a
 * game open it is the setup walk (`EncounterSetup`) until the game starts, and
 * the tracker (`PlayTracker`) after. The game itself is the encounter on the
 * player's own campaign document, as it has been since v0.31.0.
 */
export default function PlayTab({
  campaign, arsenal, leader, archetype, membership, actions, shared, rules, roster, onToTable, startCrew,
}) {
  const encounter = openEncounter(campaign, arsenal.id)
  const tracker = usePlay(encounter?.id)
  const [atSetup, setAtSetup] = useState(false)
  const [crewId, setCrewId] = useState(startCrew?.id || '')
  const crews = arsenal.crews || []

  if (!encounter) {
    const asked = invitations(shared?.sessions, campaign)
    const totalOf = (a) => arsenalTotal((a.models || []).filter((m) => !m.annihilated))
    const chosen = crews.find((c) => c.id === crewId) || null
    return (
      <>
        {asked.map((s) => {
          const theirArsenal = (membership?.arsenals || []).find((a) => a.id === s.theirs.arsenalId)
          return (
            <div className="gap-note" key={s.id}>
              <strong>{s.theirs.nickname || 'A player at your table'}</strong>
              {s.theirs.leader ? ` (${s.theirs.leader})` : ''} has asked you to hire for a game
              {s.week ? ` in week ${s.week}` : ''}. Neither crew is visible until you both reveal.
              <div className="export">
                <Button onClick={() => actions.startEncounter({
                  sharedId: s.id,
                  ...(chosen ? selectionFromCrew(chosen, arsenal) : {}),
                  opponent: {
                    name: s.theirs.nickname || '',
                    arsenalId: s.theirs.arsenalId,
                    arsenalTotal: theirArsenal ? totalOf(theirArsenal) : null,
                    rating: null,
                  },
                })}
                >
                  Play it
                </Button>
                <Button ghost onClick={() => shared.close(s.id).catch(() => {})}>Not playing</Button>
              </div>
            </div>
          )
        })}
        <Field>
          <Label>Start a game</Label>
          <p className="note">
            Walks the encounter setup the way the rules lay it out, from the
            encounter size to the start of the game, then tracks the game itself.
          </p>
          {crews.length > 0 && (
            <Select value={crewId} onChange={(e) => setCrewId(e.target.value)} aria-label="Which crew">
              <option value="">Hire a new crew during setup</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || 'Unnamed crew'} — {crewCost(c, arsenal)}ss
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Button onClick={() => actions.startEncounter(chosen ? selectionFromCrew(chosen, arsenal) : {})}>
          {chosen ? `Start a game with ${chosen.name || 'this crew'}` : 'Start a game'}
        </Button>
      </>
    )
  }

  const discard = () => {
    if (encounter.sharedId && shared) shared.close(encounter.sharedId).catch(() => {})
    tracker.clear()
    actions.discardEncounter(encounter.id)
  }

  if (tracker.play && !atSetup) {
    return (
      <PlayTracker
        encounter={encounter}
        arsenal={arsenal}
        leader={leader}
        archetype={archetype}
        rules={rules}
        roster={roster}
        tracker={tracker}
        reference={<GameReference setup={encounter.setup} />}
        onBackToHire={() => setAtSetup(true)}
        onFinish={(facts) => {
          actions.updateEncounter(encounter.id, { playFacts: facts })
          onToTable()
        }}
      />
    )
  }

  return (
    <>
      {tracker.play && (
        <div className="export">
          <Button onClick={() => { setAtSetup(false); window.scrollTo(0, 0) }}>Back to the game</Button>
        </div>
      )}
      <EncounterSetup
        encounter={encounter}
        campaign={campaign}
        arsenal={arsenal}
        leader={leader}
        archetype={archetype}
        membership={membership}
        actions={actions}
        shared={shared}
        rules={rules}
        onStart={(pool) => {
          if (!tracker.play) tracker.start(pool)
          setAtSetup(false)
          window.scrollTo(0, 0)
        }}
        onDiscard={discard}
      />
    </>
  )
}

/** The strategy and your scheme, to hand during the game. */
function GameReference({ setup }) {
  const [open, setOpen] = useState(false)
  const text = useScenarioText(Boolean(setup?.strategy || setup?.scheme))
  if (!setup?.strategy && !setup?.scheme) return null
  return (
    <Field>
      <Label>This game</Label>
      <p className="setup__fact">
        {setup.strategy && <>Strategy <strong>{strategyBySlug(setup.strategy)?.name}</strong>. </>}
        {setup.scheme && <>Your scheme <strong>{schemeBySlug(setup.scheme)?.name}</strong>.</>}
      </p>
      <Button ghost onClick={() => setOpen((v) => !v)}>{open ? 'Hide' : 'Show'} the text</Button>
      {open && (
        <>
          {setup.strategy && <ScenarioCard kind="strategy" slug={setup.strategy} text={text} />}
          {setup.scheme && <ScenarioCard kind="scheme" slug={setup.scheme} text={text} />}
        </>
      )}
    </Field>
  )
}
