import { useState, useEffect, useRef, useId } from 'react'

/**
 * A search field that is also the thing holding the answer.
 *
 * The old two-part arrangement — click a slot, then type in a shared box below
 * it — made the player track which slot the box was pointed at. Here each slot
 * owns its own input, so what you type and what it fills in are the same
 * control.
 *
 * `search` may fail; the register is allowed to be down (§6). When it does,
 * this degrades to plain typed entry rather than trapping the player behind a
 * list that will not load, which is why `allowRaw` exists.
 */
export default function Combobox({
  value,
  display,
  onChange,
  search,
  placeholder,
  label,
  allowRaw = true,
  rawHint = 'use as typed',
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [failed, setFailed] = useState(false)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef(null)
  const listId = useId()

  const term = query.trim()

  useEffect(() => {
    if (!open || term.length < 2) { setResults([]); setSearching(false); return }
    const controller = new AbortController()
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const found = await search(term, { signal: controller.signal })
        setResults(found.slice(0, 8))
        setFailed(false)
      } catch (err) {
        if (err?.name === 'AbortError') return
        setResults([])
        setFailed(true)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [term, open, search])

  // The raw-entry row is a real option, so arrow keys reach it like any other.
  const rawRow =
    allowRaw && term.length >= 2 && !results.some((r) => r.slug === term)
      ? { slug: term, name: term, raw: true }
      : null
  const options = rawRow ? [...results, rawRow] : results

  const commit = (option) => {
    if (!option) return
    onChange(option.slug, option)
    setQuery('')
    setResults([])
    setOpen(false)
    setActive(-1)
  }

  const clear = () => {
    onChange('', null)
    setQuery('')
    setOpen(false)
    setActive(-1)
    inputRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      if (options.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + options.length) % options.length)
    } else if (e.key === 'Enter') {
      if (open && active >= 0) { e.preventDefault(); commit(options[active]) }
      else if (open && options.length === 1) { e.preventDefault(); commit(options[0]) }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); setActive(-1) }
    }
  }

  const status = searching
    ? 'Searching…'
    : failed
      ? 'Search did not reach the register — type the slug and press enter.'
      : options.length === 0 && term.length >= 2
        ? 'Nothing matched.'
        : ''

  return (
    <div
      className="combo"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) { setOpen(false); setActive(-1) }
      }}
    >
      <div className="combo__field">
        <input
          ref={inputRef}
          className={`input combo__input${value ? ' combo__input--set' : ''}`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label={label}
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={open ? query : (display || value || '')}
          placeholder={placeholder}
          onFocus={(e) => { setOpen(true); setQuery(''); e.target.select() }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(-1) }}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            className="combo__clear"
            aria-label={`Clear ${label}`}
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>

      {open && (options.length > 0 || status) && (
        <div className="combo__pop">
          <ul className="combo__list" id={listId} role="listbox" aria-label={label}>
            {options.map((option, i) => (
              <li
                key={option.raw ? `raw::${option.slug}` : option.slug}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`combo__opt${i === active ? ' combo__opt--on' : ''}`}
                // mousedown, not click: the input must not blur first.
                onMouseDown={(e) => { e.preventDefault(); commit(option) }}
                onMouseEnter={() => setActive(i)}
              >
                <span>{option.name}</span>
                <span className="row__meta">{option.raw ? rawHint : option.slug}</span>
              </li>
            ))}
          </ul>
          {status && <p className={`combo__status${failed ? ' note--warn' : ''}`}>{status}</p>}
        </div>
      )}
    </div>
  )
}
