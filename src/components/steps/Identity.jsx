import { useState, useEffect } from 'react'
import { FACTIONS } from '../../data/factions.js'
import { registry } from '../../lib/api.js'
import { Label, Field, Input, Chip } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import { CREATION } from '../../data/hank.js'

export default function Identity({ leader, set }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [slot, setSlot] = useState(0)
  const [searchFailed, setSearchFailed] = useState(false)

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const found = await registry.searchKeywords(query.trim(), { signal: controller.signal })
        setResults(found.slice(0, 8))
        setSearchFailed(false)
      } catch {
        setResults([])
        setSearchFailed(true)
      }
    }, 350)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [query])

  const pickKeyword = (kwSlug) => {
    const next = [...leader.keywords]
    next[slot] = kwSlug
    set({ keywords: next })
    setQuery(''); setResults([])
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
        <div className="pair" style={{ marginBottom: 8 }}>
          {[0, 1].map((i) => (
            <button
              key={i}
              className="chip"
              onClick={() => { setSlot(i); setQuery('') }}
              style={{
                borderColor: slot === i ? 'var(--oxide)' : 'var(--line)',
                color: leader.keywords[i] ? 'var(--text)' : 'var(--mute)',
                padding: '9px 11px', fontSize: 13, textAlign: 'left',
              }}
            >
              {leader.keywords[i] || `keyword ${i + 1}`}
            </button>
          ))}
        </div>

        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search for keyword ${slot + 1}…`}
        />

        {results.length > 0 && (
          <div style={{ border: '1px solid var(--line)', borderTop: 'none' }}>
            {results.map((k) => (
              <button className="row" key={k.slug} onClick={() => pickKeyword(k.slug)}>
                <span>{k.name}</span>
                <span className="row__meta">{k.slug}</span>
              </button>
            ))}
          </div>
        )}

        {searchFailed && (
          <>
            <p className="note note--warn">
              Search didn't reach the register. Type the keyword slugs straight in — the loadout
              step falls back to entry by hand.
            </p>
            <div className="pair" style={{ marginTop: 8 }}>
              {[0, 1].map((i) => (
                <Input
                  key={i}
                  placeholder={`keyword ${i + 1} slug`}
                  value={leader.keywords[i]}
                  onChange={(e) => {
                    const next = [...leader.keywords]
                    next[i] = e.target.value.trim()
                    set({ keywords: next })
                  }}
                />
              ))}
            </div>
          </>
        )}

        {duplicate && <p className="note note--warn">Pick two different keywords.</p>}
      </Field>
    </>
  )
}
