import { useState } from 'react'
import { Label, Field, Button, Input } from '../ui.jsx'
import { crewCost, crewRating, hiredModels } from '../../lib/encounter.js'
import { createCrew, crewGaps, copyCrew, nextCrewName } from '../../lib/crews.js'
import CrewPicker from './CrewPicker.jsx'

/**
 * Crews built ahead of a game (v0.34.0, owner request): the Crews tab.
 *
 * A list, and one crew open for editing at a time. Every change is saved as it
 * is made, like everything else on the arsenal, so there is no Save button to
 * forget. "Play this crew" opens the Play tab with it hired.
 */
export default function SavedCrews({ arsenal, leader, archetype, rules, actions, onPlay, canPlay }) {
  const crews = arsenal.crews || []
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const crew = crews.find((c) => c.id === editing) || null

  if (crew) {
    const save = (patch) => actions.saveCrew({ ...crew, ...(typeof patch === 'function' ? patch(crew) : patch) })
    const size = crew.size != null && crew.size !== '' && Number.isFinite(Number(crew.size)) ? Number(crew.size) : null
    return (
      <>
        <div className="grid2">
          <Field>
            <Label>Name</Label>
            <Input value={crew.name} onChange={(e) => save({ name: e.target.value })} placeholder="e.g. Scheme runners" />
          </Field>
          <Field>
            <Label>Built for, ss</Label>
            <Input
              value={crew.size ?? ''}
              onChange={(e) => save({ size: e.target.value === '' ? null : e.target.value })}
              inputMode="numeric"
              placeholder="optional"
            />
          </Field>
        </div>
        <CrewPicker
          selection={crew}
          onChange={save}
          arsenal={arsenal}
          leader={leader}
          archetype={archetype}
          rules={rules}
          size={size}
        />
        <div className="export">
          <Button onClick={() => setEditing(null)}>Done</Button>
          {canPlay && <Button ghost onClick={() => onPlay(crew)}>Play this crew</Button>}
        </div>
      </>
    )
  }

  return (
    <>
      <Field>
        <Label>Your crews</Label>
        <p className="note">
          Crews you have put together from this arsenal, ready to pick when a
          game starts. A model lost since a crew was built is left out when it
          is played.
        </p>
      </Field>

      {crews.length === 0 && <div className="empty">No crews yet.</div>}

      <div className="crews__list">
        {crews.map((c) => {
          const gaps = crewGaps(c, arsenal)
          const n = hiredModels(c, arsenal).length
          return (
            <article className="crews__item" key={c.id}>
              <div className="crews__head">
                <h3 className="crews__name">{c.name || 'Unnamed crew'}</h3>
                <span className="hire__adj">
                  {crewCost(c, arsenal)}ss{c.size ? ` of ${c.size}` : ''} · {n + 1 + (c.totem && arsenal.totem ? 1 : 0)} models · rating {crewRating(c, arsenal)}
                </span>
              </div>
              {gaps.length > 0 && <p className="note note--warn">No longer in the arsenal: {gaps.join(', ')}.</p>}
              <div className="export">
                <Button ghost onClick={() => setEditing(c.id)}>Edit</Button>
                {canPlay && <Button ghost onClick={() => onPlay(c)}>Play this crew</Button>}
                <Button ghost onClick={() => actions.saveCrew(copyCrew(c))}>Copy</Button>
                {deleting === c.id ? (
                  <>
                    <Button ghost onClick={() => { actions.deleteCrew(c.id); setDeleting(null) }}>Yes, delete it</Button>
                    <Button ghost onClick={() => setDeleting(null)}>Keep it</Button>
                  </>
                ) : (
                  <Button ghost onClick={() => setDeleting(c.id)}>Delete</Button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      <div className="export">
        <Button
          onClick={() => {
            const fresh = createCrew({ name: nextCrewName(crews) })
            actions.saveCrew(fresh)
            setEditing(fresh.id)
          }}
        >
          New crew
        </Button>
      </div>
    </>
  )
}
