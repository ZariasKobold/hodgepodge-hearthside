import { useState, useCallback } from 'react'
import { FACTIONS } from '../../data/factions.js'
import { registry } from '../../lib/api.js'
import { Label, Field, Input, Chip } from '../ui.jsx'
import Combobox from '../Combobox.jsx'
import PortraitPicker from '../PortraitPicker.jsx'
import HankSays from '../HankSays.jsx'
import { CREATION } from '../../data/hank.js'

/**
 * Only the slug is stored — the roster fetch keys off it, and a display name
 * is the register's to change. Names picked from search are remembered for
 * this visit so the boxes read "Bayou Bushwhacker" rather than
 * "bayou-bushwhacker"; on a reload the slug is titled up instead, which is
 * right often enough and never wrong in a way that misleads.
 */
const titleize = (slug) =>
  String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

export default function Identity({ leader, set }) {
  const [names, setNames] = useState({})

  const search = useCallback((term, opts) => registry.searchKeywords(term, opts), [])

  const pick = (index) => (slug, option) => {
    if (option && !option.raw) setNames((prev) => ({ ...prev, [option.slug]: option.name }))
    const next = [...leader.keywords]
    next[index] = slug
    set({ keywords: next })
  }

  const duplicate = leader.keywords[0] && leader.keywords[0] === leader.keywords[1]

  return (
    <>
      <HankSays>{CREATION.identity}</HankSays>

      <Field>
        <Label>Leader name</Label>
        <Input
          value={leader.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Not a name an existing model already has"
        />
      </Field>

      <Field>
        <Label>Picture of the model</Label>
        <PortraitPicker
          value={leader.portrait || null}
          name={leader.name}
          onChange={(portrait) => set({ portrait })}
        />
      </Field>

      <Field>
        <Label>Declared faction</Label>
        <div className="chips">
          {FACTIONS.map((f) => (
            <Chip key={f.slug} on={leader.faction === f.slug} onClick={() => set({ faction: f.slug })}>
              {f.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field>
        <Label>Two keywords — at least one holding a model of your faction</Label>
        <div className="pair">
          {[0, 1].map((i) => (
            <Combobox
              key={i}
              label={`Keyword ${i + 1}`}
              value={leader.keywords[i] || ''}
              display={names[leader.keywords[i]] || titleize(leader.keywords[i])}
              onChange={pick(i)}
              search={search}
              placeholder={`Search keyword ${i + 1}…`}
              rawHint="use this slug"
            />
          ))}
        </div>

        {duplicate && <p className="note note--warn">Pick two different keywords.</p>}
      </Field>
    </>
  )
}
