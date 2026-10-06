import Encounter from './Encounter.jsx'
import { useSharedCrew } from '../../hooks/useSharedCrew.js'

/**
 * The Crew view: hire a crew for this week's game, alone or with an opponent.
 *
 * Top-level by owner decision (v0.32.1). It used to be a sub-tab of Campaign,
 * between Weekly hire and Aftermath, and that buried the one screen a player
 * opens at the table before every game. Everything it does is in `Encounter`
 * and `lib/encounter.js`; this file only owns the shared session's polling,
 * which runs only while this view is mounted, so nobody pays for it elsewhere.
 */
export default function Crew({ campaign, arsenal, leader, membership, actions, signedIn, onToTable }) {
  const shared = useSharedCrew({
    tableId: membership?.tableId,
    enabled: Boolean(signedIn),
  })

  return (
    <Encounter
      campaign={campaign}
      arsenal={arsenal}
      leader={leader}
      membership={membership}
      actions={actions}
      shared={shared}
      onToTable={onToTable}
    />
  )
}
