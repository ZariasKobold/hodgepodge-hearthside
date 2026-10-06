import { useEffect, useState, useId } from 'react'
import { Label, Field, Button, Input, Chip } from '../ui.jsx'
import { injuriesFor } from '../../lib/shape/arsenal.js'
import { hiredModels, hiredEquipment, hireCostOf, LEADER, TOTEM } from '../../lib/encounter.js'
import {
  TURNS, COMMON_CONDITIONS, unitOf, healthLeft, maxHealthOf, damage, setMaxHealth,
  toggleActivated, toggleKilled, addCondition, changeCondition, removeCondition,
  nextTurn, previousTurn, adjustPool, adjustVp, vpTotal, addSummon, removeSummon,
  activationCount, playFacts,
} from '../../lib/play.js'
import { StatCard } from '../CrewCards.jsx'
import LeaderRecord from '../LeaderRecord.jsx'
import TotemCard from '../TotemCard.jsx'

/**
 * The crew at the table: a tracker for the game itself.
 *
 * Owner request, Session 77 — the crew builder should be useful *during* play,
 * like Wyrd's crew builder app: the turn, the pool, the score, and for every
 * model its health, conditions, whether it has activated, and its card.
 *
 * It counts and it never decides (`lib/play.js`). It lives on this device
 * (`usePlay`); "Game over" hands the score and who died to the game log.
 * No Hank: a game in progress is the last place for narration (§3).
 */
export default function PlayTracker({
  encounter, arsenal, leader, archetype, rules, roster, tracker, onBackToHire, onFinish,
}) {
  const { play, change, clear } = tracker
  const [clearing, setClearing] = useState(false)
  const hired = hiredModels(encounter, arsenal)
  const kit = hiredEquipment(encounter, arsenal)
  const withTotem = Boolean(encounter.totem && arsenal.totem)

  // Every card this crew could need, read once when the game starts. A hired
  // crew is a handful of requests, and the text is still never stored (§4).
  const slugs = [...hired.map((m) => m.slug), ...play.summons.map((s) => s.slug)].filter(Boolean)
  const slugKey = slugs.join(',')
  useEffect(() => {
    if (slugs.length) rules.ensureAll(slugs)
  }, [slugKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const units = [
    {
      key: LEADER, name: leader.name || 'Your leader', tag: 'leader',
      cardMax: archetype?.stats?.health ?? null,
      injuries: injuriesFor(arsenal, {}),
      reference: <LeaderRecord leader={leader} archetype={archetype} rules={rules} />,
    },
    ...(withTotem ? [{
      key: TOTEM, name: arsenal.totem.name || 'Totem', tag: 'totem',
      cardMax: arsenal.totem.stats?.health ?? null,
      injuries: [],
      reference: <TotemCard totem={arsenal.totem} />,
    }] : []),
    ...hired.map((m) => {
      const card = m.slug ? rules.card(m.slug) : null
      return {
        key: m.id, name: m.name, tag: `${hireCostOf(m, arsenal)}ss${m.peon ? ' · peon' : ''}`,
        cardMax: card?.health ?? null,
        injuries: injuriesFor(arsenal, m.titleGroup ? { titleGroup: m.titleGroup } : { modelId: m.id }),
        reference: card ? <StatCard card={card} /> : null,
        slug: m.slug,
      }
    }),
    ...play.summons.map((s) => {
      const card = s.slug ? rules.card(s.slug) : null
      return {
        key: s.id, name: s.name, tag: 'arrived in play', summon: true,
        cardMax: card?.health ?? null,
        injuries: [],
        reference: card ? <StatCard card={card} /> : null,
        slug: s.slug,
      }
    }),
  ]
  const keys = units.map((u) => u.key)
  const acts = activationCount(play, keys)
  const kitFor = (key) => kit.filter((x) => x.holder === key).map((x) => x.row.name)
  const allDone = acts.of > 0 && acts.done === acts.of

  return (
    <>
      <div className="play__bar">
        <div className="play__group">
          <span className="play__k">Turn</span>
          <button type="button" className="play__step" onClick={() => change(previousTurn)} aria-label="Previous turn" disabled={play.turn <= 1}>−</button>
          <strong className="play__v">{play.turn}</strong>
          <span className="play__of">of {TURNS}</span>
          <Button onClick={() => change(nextTurn)} ghost={!allDone}>Next turn</Button>
        </div>
        <Counter label="Pool" value={play.pool} onStep={(d) => change((p) => adjustPool(p, d))} />
        <div className="play__group">
          <span className="play__k">VP</span>
          <strong className="play__v">{vpTotal(play)}</strong>
          <span className="play__of">to {play.vp.opponent}</span>
        </div>
        <div className="play__group">
          <span className="play__k">
            <span className="play__long">Activated</span>
            <span className="play__short">Acted</span>
          </span>
          <strong className="play__v">{acts.done}</strong>
          <span className="play__of">of {acts.of}</span>
        </div>
      </div>

      <div className="play__units">
        {units.map((u) => (
          <Unit
            key={u.key}
            unit={u}
            state={unitOf(play, u.key)}
            left={healthLeft(play, u.key, u.cardMax)}
            max={maxHealthOf(play, u.key, u.cardMax)}
            kit={kitFor(u.key)}
            change={change}
            loadingCard={Boolean(u.slug) && !u.reference && rules.batch.loading}
            onRemove={u.summon ? () => change((p) => removeSummon(p, u.key)) : null}
          />
        ))}
      </div>

      <Summon roster={roster} arsenal={arsenal} rules={rules} onAdd={(s) => change((p) => addSummon(p, s))} />

      <Field>
        <Label>Score</Label>
        <div className="play__score">
          <Counter label="Strategy" value={play.vp.strategy} onStep={(d) => change((p) => adjustVp(p, 'strategy', d))} />
          <Counter label="Schemes" value={play.vp.schemes} onStep={(d) => change((p) => adjustVp(p, 'schemes', d))} />
          <Counter label="Schemes scored" value={play.vp.schemesScored} onStep={(d) => change((p) => adjustVp(p, 'schemesScored', d))} />
          <Counter label="Their VP" value={play.vp.opponent} onStep={(d) => change((p) => adjustVp(p, 'opponent', d))} />
        </div>
        <p className="note">
          &ldquo;Schemes scored&rdquo; counts schemes that earned at least 1 VP, which
          is what the aftermath hand reads. Everything here goes to the game log
          when you finish, and you can still correct it there.
        </p>
      </Field>

      {rules.batch.error && (
        <p className="note note--warn">
          Some cards could not be read from BiggerHat ({rules.batch.error}). Type a
          model&rsquo;s health on its card to track it anyway.
        </p>
      )}

      <div className="export">
        <Button onClick={() => onFinish(playFacts(play, { hiredModels: hired }))}>
          Game over — record it
        </Button>
        <Button ghost onClick={onBackToHire}>Back to the hire</Button>
        {clearing ? (
          <>
            <Button ghost onClick={() => { clear(); setClearing(false) }}>Yes, wipe the tracker</Button>
            <Button ghost onClick={() => setClearing(false)}>Keep it</Button>
          </>
        ) : (
          <Button ghost onClick={() => setClearing(true)}>Wipe the tracker</Button>
        )}
      </div>
      <p className="note">
        The tracker is kept on this device until the game is recorded. Your
        crew is unchanged by anything you do here.
      </p>
    </>
  )
}

/** A number with a minus and a plus either side. */
function Counter({ label, value, onStep }) {
  return (
    <div className="play__group">
      <span className="play__k">{label}</span>
      <button type="button" className="play__step" onClick={() => onStep(-1)} aria-label={`${label} down`}>−</button>
      <strong className="play__v">{value}</strong>
      <button type="button" className="play__step" onClick={() => onStep(1)} aria-label={`${label} up`}>+</button>
    </div>
  )
}

function Unit({ unit, state, left, max, kit, change, loadingCard, onRemove }) {
  const [showCard, setShowCard] = useState(false)
  const [condition, setCondition] = useState('')
  const listId = useId()
  const key = unit.key
  const hit = (d) => change((p) => damage(p, key, d, unit.cardMax))
  const pct = max ? Math.round((left / max) * 100) : null

  const add = () => {
    change((p) => addCondition(p, key, condition, 1))
    setCondition('')
  }

  return (
    <article
      className={`play__unit${state.killed ? ' play__unit--killed' : ''}${state.activated ? ' play__unit--done' : ''}`}
      aria-label={unit.name}
    >
      <header className="play__head">
        <div>
          <h3 className="play__name">{unit.name}</h3>
          <span className="play__tag">{unit.tag}</span>
        </div>
        {!state.killed && (
          <Chip on={state.activated} onClick={() => change((p) => toggleActivated(p, key))}>
            {state.activated ? 'Activated' : 'Ready'}
          </Chip>
        )}
      </header>

      <div className="play__health">
        <button type="button" className="play__step play__step--big" onClick={() => hit(1)} aria-label={`${unit.name} takes 1 damage`} disabled={state.killed}>−</button>
        <div className="play__hp">
          {max != null ? (
            <>
              <strong>{left}</strong><span>/{max}</span>
              <div className="play__meter" aria-hidden="true">
                <div className={`play__fill${pct <= 34 ? ' play__fill--low' : ''}`} style={{ width: `${pct}%` }} />
              </div>
            </>
          ) : (
            <Input
              className="input play__max"
              inputMode="numeric"
              placeholder={loadingCard ? 'reading…' : 'health'}
              aria-label={`${unit.name} maximum health`}
              onBlur={(e) => change((p) => setMaxHealth(p, key, e.target.value))}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            />
          )}
        </div>
        <button type="button" className="play__step play__step--big" onClick={() => hit(-1)} aria-label={`${unit.name} heals 1`} disabled={state.killed}>+</button>
      </div>

      {state.conditions.length > 0 && (
        <ul className="play__conditions">
          {state.conditions.map((c) => (
            <li key={c.name} className="play__condition">
              <span>{c.name}</span>
              <button type="button" className="play__step" onClick={() => change((p) => changeCondition(p, key, c.name, -1))} aria-label={`${c.name} down`}>−</button>
              <strong>{c.value}</strong>
              <button type="button" className="play__step" onClick={() => change((p) => changeCondition(p, key, c.name, 1))} aria-label={`${c.name} up`}>+</button>
              <button type="button" className="play__x" onClick={() => change((p) => removeCondition(p, key, c.name))} aria-label={`Remove ${c.name}`}>×</button>
            </li>
          ))}
        </ul>
      )}

      {!state.killed && (
        <form className="play__add" onSubmit={(e) => { e.preventDefault(); add() }}>
          <Input
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            list={listId}
            placeholder="Condition or token"
            aria-label={`Add a condition to ${unit.name}`}
          />
          <datalist id={listId}>
            {COMMON_CONDITIONS.map((n) => <option key={n} value={n} />)}
          </datalist>
          <Button ghost type="submit" disabled={!condition.trim()}>Add</Button>
        </form>
      )}

      {(kit.length > 0 || unit.injuries.length > 0) && (
        <p className="play__notes">
          {kit.length > 0 && <span>Carrying {kit.join(', ')}. </span>}
          {unit.injuries.length > 0 && <span>Injured: {unit.injuries.map((i) => i.name).join(', ')}.</span>}
        </p>
      )}

      <div className="play__foot">
        {unit.reference ? (
          <Button ghost onClick={() => setShowCard((v) => !v)}>{showCard ? 'Hide card' : 'Card'}</Button>
        ) : (
          <span className="play__tag">{loadingCard ? 'Reading card…' : unit.slug ? 'Card not read' : 'No card on file'}</span>
        )}
        <Button ghost onClick={() => change((p) => toggleKilled(p, key))}>
          {state.killed ? 'Back in play' : 'Killed'}
        </Button>
        {onRemove && <Button ghost onClick={onRemove}>Remove</Button>}
      </div>

      {showCard && unit.reference && <div className="play__card">{unit.reference}</div>}
    </article>
  )
}

/**
 * A model that comes in partway: summoned, or anything else that arrives.
 * Picked off the register when it has been loaded, or typed.
 */
function Summon({ roster, arsenal, rules, onAdd }) {
  const [name, setName] = useState('')
  const [health, setHealth] = useState('')
  const listId = useId()
  const match = roster.models.find((m) => m.name.toLowerCase() === name.trim().toLowerCase())

  const submit = (e) => {
    e.preventDefault()
    if (!name.trim()) return
    if (match?.slug) rules.ensure?.(match.slug)
    onAdd({ name: match?.name || name, slug: match?.slug || null, maxHealth: health ? Number(health) : null })
    setName('')
    setHealth('')
  }

  return (
    <Field>
      <Label>Something arrived in play</Label>
      <form className="play__add" onSubmit={submit}>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          list={listId}
          placeholder="Name of the model"
          aria-label="Name of the model that arrived"
        />
        <datalist id={listId}>
          {roster.models.map((m) => <option key={m.slug} value={m.name} />)}
        </datalist>
        <Input
          className="input play__max"
          value={health}
          onChange={(e) => setHealth(e.target.value)}
          inputMode="numeric"
          placeholder={match ? 'from card' : 'health'}
          aria-label="Its health"
        />
        <Button type="submit" disabled={!name.trim()}>Add it</Button>
      </form>
      <p className="note">
        A summoned model, or anything else that joins partway through. It is
        tracked for this game only and never joins your arsenal.
        {roster.models.length === 0 && ' Load your keywords’ models to pick from a list and read their cards.'}
      </p>
      {roster.models.length === 0 && (
        <Button
          ghost
          onClick={() => roster.load({ keywords: arsenal.keywords, faction: arsenal.faction })}
          disabled={roster.loading}
        >
          {roster.loading ? 'Reading models…' : 'Load models from the register'}
        </Button>
      )}
    </Field>
  )
}
