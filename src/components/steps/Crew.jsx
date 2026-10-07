import { useState } from 'react'
import { useSharedCrew } from '../../hooks/useSharedCrew.js'
import { openEncounter } from '../../lib/encounter.js'
import { selectionFromCrew } from '../../lib/crews.js'
import { invitations } from '../../lib/sharedCrew.js'
import ArsenalCards from '../crew/ArsenalCards.jsx'
import SavedCrews from '../crew/SavedCrews.jsx'
import PlayTab from '../crew/PlayTab.jsx'

const TABS = [
  { id: 'cards', label: 'Cards' },
  { id: 'crews', label: 'Crews' },
  { id: 'play', label: 'Play' },
]

/**
 * The Crew view: the arsenal's cards, crews built ahead of time, and a game.
 *
 * Top-level by owner decision (v0.32.1). Split into three tabs at v0.34.0, also
 * by owner request: reading cards, building crews without a game in mind, and
 * playing one are three different jobs that were sharing one screen.
 *
 * The shared session's polling lives here, so it runs only on this view.
 */
export default function Crew({
  campaign, arsenal, leader, archetype, membership, actions, signedIn, rules, roster, onToTable,
}) {
  const shared = useSharedCrew({
    tableId: membership?.tableId,
    enabled: Boolean(signedIn),
  })
  const playing = Boolean(openEncounter(campaign, arsenal.id))
  const asked = invitations(shared?.sessions, campaign).length > 0
  const [tab, setTab] = useState(playing ? 'play' : 'crews')

  // "Play this crew" from the Crews tab: start the game with it hired.
  const playCrew = (crew) => {
    actions.startEncounter(selectionFromCrew(crew, arsenal))
    setTab('play')
    window.scrollTo(0, 0)
  }

  return (
    <>
      <nav className="subviews" aria-label="Crew section">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`views__item${tab === t.id ? ' views__item--on' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
            {/* A game in progress, or one somebody has asked you into. */}
            {t.id === 'play' && (playing || asked) && (
              <span className="views__dot" aria-label={playing ? 'game in progress' : 'invitation waiting'} />
            )}
          </button>
        ))}
      </nav>

      {tab === 'cards' && (
        <ArsenalCards arsenal={arsenal} leader={leader} archetype={archetype} rules={rules} />
      )}
      {tab === 'crews' && (
        <SavedCrews
          arsenal={arsenal}
          leader={leader}
          archetype={archetype}
          rules={rules}
          actions={actions}
          canPlay={!playing}
          onPlay={playCrew}
        />
      )}
      {tab === 'play' && (
        <PlayTab
          campaign={campaign}
          arsenal={arsenal}
          leader={leader}
          archetype={archetype}
          membership={membership}
          actions={actions}
          shared={shared}
          rules={rules}
          roster={roster}
          onToTable={onToTable}
        />
      )}
    </>
  )
}
