import { useState } from 'react'
import WeekControl from '../WeekControl.jsx'
import WeeklyHire from './WeeklyHire.jsx'
import Aftermath from '../Aftermath.jsx'
import Players from './Players.jsx'
import {
  standingRating, activeInjuryCount,
} from '../../lib/shape/arsenal.js'
import {
  gamesWon,
} from '../../lib/shape/campaign.js'
/**
 * The campaign view: what happens between games and what happens after one.
 *
 * The two halves are deliberately together rather than being separate views.
 * They share the week and the scrip, and the order a real evening runs in is
 * hire, play, aftermath, hire again — splitting them across the top-level
 * navigation would suggest they were separate places rather than two ends of
 * the same loop.
 *
 * The week sits above both because it governs both: it decides who owes a hire
 * and which hires get the first-of-week discount, and it stamps every game.
 */
const TABS = [
  { id: 'hire', label: 'Weekly hire' },
  { id: 'aftermath', label: 'Aftermath' },
  { id: 'players', label: 'Players' },
]

export default function Campaign({
  campaign, arsenal, leader, week, roster, actions, houseRules, mustHire,
  membership, shelf, signedIn,
}) {
  const [tab, setTab] = useState('hire')

  const openGame = (campaign.games || []).find(
    (g) => g.arsenalId === arsenal.id && g.aftermath?.phase && !g.aftermath?.done
  )

  const pendingCount = membership.isHost
    ? membership.members.filter((m) => m.status === 'pending').length
    : 0

  return (
    <>
      <WeekControl
        campaign={campaign}
        week={week}
        weeksTotal={campaign.weeksTotal}
        onSetWeek={actions.setWeek}
        onStepWeek={actions.stepWeek}
        onSetWeekMode={actions.setWeekMode}
        onResetWeek={actions.resetWeek}
        onSetStartedAt={actions.setStartedAt}
        onSetWeeksTotal={actions.setWeeksTotal}
        onSetWeekLength={(days) => actions.setHouseRules({ weekLengthDays: days })}
      />

      <div className="hire__ledger">
        <span><strong>{arsenal.scrip}</strong> scrip</span>
        <span><strong>{gamesWon(campaign, arsenal.id)}</strong> games won</span>
        <span>rating <strong>{standingRating(arsenal)}</strong> + kit hired</span>
        <span><strong>{activeInjuryCount(arsenal)}</strong> injuries</span>
      </div>

      <nav className="subviews" aria-label="Campaign section">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`views__item${tab === t.id ? ' views__item--on' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            {t.label}
            {/* An aftermath left half-finished is the easiest thing in the app
                to forget about, and it holds unpaid scrip and unflipped
                injuries. It says so on the tab rather than only inside it. */}
            {t.id === 'aftermath' && openGame && <span className="views__dot" aria-label="unfinished" />}
            {/* Someone is waiting at the door. The host is the only one who can
                open it, and it is the easiest thing here to not notice. */}
            {t.id === 'players' && pendingCount > 0 && (
              <span className="views__dot" aria-label={`${pendingCount} waiting`} />
            )}
          </button>
        ))}
      </nav>

      {tab === 'hire' && (
        <WeeklyHire
          arsenal={arsenal}
          week={week}
          houseRules={houseRules}
          mustHire={mustHire}
          roster={roster}
          onHire={actions.onHire}
        />
      )}

      {tab === 'players' && (
        <Players
          campaign={campaign}
          shelf={shelf}
          membership={membership}
          signedIn={signedIn}
        />
      )}

      {tab === 'aftermath' && (
        <Aftermath
          campaign={campaign}
          arsenal={arsenal}
          leader={leader}
          week={week}
          actions={actions}
        />
      )}
    </>
  )
}
