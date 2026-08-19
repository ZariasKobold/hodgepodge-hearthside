import { useHank } from '../hooks/useHank.jsx'
import AccountBadge from './AccountBadge.jsx'

const STEPS = ['Identity', 'Archetype', 'Loadout', 'Record']

export default function Masthead({ step, onJump, fileNumber, auth, admitted = true, view = 'create', onView }) {
  const { enabled, toggle } = useHank()

  return (
    <header className="masthead">
      <div className="masthead__top">
        <div>
          <h1 className="masthead__title">Hodgepodge Hearthside</h1>
          <div className="masthead__sub">An Emissary's Campfire Wisecracks for Campaign Play</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            className="hank-toggle"
            onClick={toggle}
            aria-pressed={enabled}
            title={enabled ? 'Hide the narration' : 'Show the narration'}
          >
            Hank: {enabled ? 'on' : 'off'}
          </button>
          <AccountBadge auth={auth} />
          <span className="masthead__file">{fileNumber}</span>
        </div>
      </div>

      {admitted && (
      <nav className="views" aria-label="Section">
        <button
          className={`views__item${view === 'create' ? ' views__item--on' : ''}`}
          onClick={() => onView('create')}
          aria-current={view === 'create' ? 'page' : undefined}
        >
          Creation
        </button>
        <button
          className={`views__item${view === 'campaign' ? ' views__item--on' : ''}`}
          onClick={() => onView('campaign')}
          aria-current={view === 'campaign' ? 'page' : undefined}
        >
          Campaign
        </button>
      </nav>
      )}

      {admitted && view === 'create' && (
      <nav className="steps" aria-label="Progress">
        {STEPS.map((label, i) => {
          const state = i === step ? 'now' : i < step ? 'done' : 'todo'
          return (
            <button
              key={label}
              className={`steps__item steps__item--${state}`}
              onClick={() => i < step && onJump(i)}
              aria-current={i === step ? 'step' : undefined}
              disabled={i > step}
            >
              {i + 1} · {label}
            </button>
          )
        })}
      </nav>
      )}
    </header>
  )
}
