import { Label, Field, Button } from './ui.jsx'
import HankSays from './HankSays.jsx'
import GameLog from './aftermath/GameLog.jsx'
import PhaseBarter from './aftermath/PhaseBarter.jsx'
import PhaseAdvance from './aftermath/PhaseAdvance.jsx'
import PhaseDoctor from './aftermath/PhaseDoctor.jsx'
import PhaseInjuries from './aftermath/PhaseInjuries.jsx'
import { aftermathReaction, campaignEnd } from '../data/hank.js'
import {
  createAftermath, phasesFor, nextPhase, firstPhase, handFor,
  paydayBreakdown, experienceFor, withdrewEarly, boxesCrossed,
} from '../lib/aftermath.js'
import {
  weeksRemaining, isCampaignOver, gamesWon, gamesPlayed,
} from '../lib/shape/campaign.js'
import { isThirst } from '../data/equipment.js'
import {
  playablePhases, phasePosition, previousPhase, revisionImpact,
  clearedRecord, describePhase, phaseHasWork, furthestReached,
} from '../lib/rewind.js'
import { useState } from 'react'
import { uid } from '../lib/shape/arsenal.js'

/**
 * The aftermath — six phases, one game, one sitting or several.
 *
 * ## One flow, not six screens
 *
 * The fate deck is not reshuffled between phases (p. 21), so the hand drawn in
 * phase one is the hand cheating every flip until phase six is finished. Six
 * independent screens would each imply a fresh deck. This walks the sequence
 * instead, and the whole record lives on the game — so closing the tab between
 * the barter and the injuries loses nothing, and the aftermath syncs like
 * everything else.
 *
 * ## Effects land as they are confirmed, not at the end
 *
 * Scrip earned, equipment bought, injuries attached: each is written to the
 * arsenal the moment the player confirms it, because a player who walks away
 * halfway through has still earned the scrip. That makes each write have to be
 * idempotent, which is what the `paid` / `applied` flags on the record are for
 * — reopening a finished phase must not pay twice.
 */
export default function Aftermath({
  campaign, arsenal, leader, week, actions,
}) {
  /** Set while a revision is being confirmed. Never a modal — see below. */
  const [revising, setRevising] = useState(null)
  // Scoped to the arsenal that is open. In v2 the campaign named its own
  // local arsenal; in v3 the arsenal is the thing you have open and the
  // campaign is a table that may seat several.
  const games = (campaign.games || []).filter((g) => g.arsenalId === arsenal.id)
  const open = games.find((g) => g.aftermath?.phase && !g.aftermath?.done) || null
  const finished = games.filter((g) => g.aftermath?.done)

  /* ── no game in progress — log one ─────────────────────────────── */

  if (!open) {
    return (
      <>
        <GameLog
          arsenal={arsenal}
          leader={leader}
          week={week}
          weeksRemaining={weeksRemaining(campaign)}
          isFirst={games.length === 0}
          onLog={(fields) => {
            const game = actions.logGame(fields)
            actions.updateGame(game.id, {
              aftermath: createAftermath({ phase: firstPhase({ ...game, ...fields }) }),
            })
          }}
        />
        {finished.length > 0 && <History games={finished} />}
        {isCampaignOver(campaign) && (
          <HankSays tone="grave">
            {campaignEnd({
              week,
              outcome: gamesWon(campaign, arsenal.id) * 2 >= gamesPlayed(campaign, arsenal.id) ? 'triumph' : 'hard',
            })}
          </HankSays>
        )}
      </>
    )
  }

  /* ── a game is mid-aftermath ───────────────────────────────────── */

  const a = open.aftermath
  const phases = phasesFor(open)
  const current = phases.find((p) => p.id === a.phase) || phases[0]

  const patch = (next) => actions.updateGame(open.id, (g) => ({ aftermath: { ...g.aftermath, ...next } }))

  /**
   * Where the walk has got to, and what has been settled.
   *
   * `furthest` bounds forward travel: you may revisit anything you have
   * reached, and you may not skip ahead to a phase you have not played. `locked`
   * is what the player has settled — a locked phase is read-only until they say
   * otherwise, which is what makes free movement safe rather than alarming.
   */
  const order = playablePhases(open).map((p) => p.id)
  const locked = a.locked || []
  const { index: furthestAt, id: furthest } = furthestReached(open, a, { locked })
  const at = phasePosition(open, a.phase)
  const back = previousPhase(open, a.phase)
  const forward = at >= 0 && at < furthestAt ? order[at + 1] : null

  /**
   * A phase behind the furthest point is settled, whether or not it is in
   * `locked`.
   *
   * Otherwise walking back onto one lands on its live form with its action
   * already spent — Payday reading "Already collected", disabled — and since
   * every phase's action button is *also* what advances the walk, there is then
   * no way onward from inside it. A settled phase shows what it recorded and
   * lets the rail carry you on, which is the whole point of being able to move.
   */
  const isSettled = (id) => locked.includes(id) || phasePosition(open, id) < furthestAt

  // `furthest` is written on every move. Leaving it to be re-derived is what
  // let stepping backwards erase it.
  const goTo = (id) => { setRevising(null); patch({ phase: id, furthest }) }

  const advance = () => {
    const to = nextPhase(open, a.phase)
    const settled = locked.includes(a.phase) ? locked : [...locked, a.phase]
    if (to) {
      patch({
        phase: to,
        locked: settled,
        // Only ever moves forward: revisiting phase 2 must not forget that
        // phase 5 has been played, or the work there becomes unreachable.
        furthest: phasePosition(open, to) > furthestAt ? to : furthest,
      })
    } else {
      patch({ done: true, locked: settled })
    }
  }

  /**
   * Unlock a phase so it can be revised.
   *
   * Anything recorded after it was decided while this phase said something
   * else, so it cannot simply stand. The player is shown exactly what would be
   * unassigned — the actual items, not a count — and nothing moves until they
   * say yes. On yes the arsenal is wound back through `rewindPhases` and those
   * phases return to blank.
   */
  const unlock = (phaseId) => {
    const impact = revisionImpact(open, a, phaseId)
    if (!impact.any) {
      // Nothing here or after it to lose, so resuming from here is free — and
      // `furthest` has to come back too, or a phase settled purely by position
      // stays settled and this button appears to do nothing.
      patch({
        phase: phaseId,
        furthest: phaseId,
        locked: locked.filter((id) => id !== phaseId),
        done: false,
      })
      return
    }
    setRevising({ phaseId, impact })
  }

  const confirmRevision = () => {
    const { phaseId, impact } = revising
    // Includes the phase being revised — see `revisionImpact`. Undoing it is
    // what makes it editable again rather than a screen saying "already done".
    const doomed = impact.phases.map((p) => p.id)
    actions.rewindPhases(a, doomed, order)
    const cleared = clearedRecord(a, doomed)
    patch({
      ...cleared,
      phase: phaseId,
      furthest: phaseId,
      locked: locked.filter((id) => id !== phaseId && !doomed.includes(id)),
      done: false,
    })
    setRevising(null)
  }

  /**
   * A locked phase renders its record rather than its inputs.
   *
   * Cheaper and safer than threading a `readOnly` prop through five phase
   * components, and it says the right thing: a settled phase is a statement of
   * what happened, not a form.
   */
  const showing = isSettled(a.phase) ? null : a.phase

  const earned = experienceFor(open, leader)

  return (
    <>
      <PhaseRail
        phases={phases}
        current={a.phase}
        furthestAt={furthestAt}
        positionOf={(id) => phasePosition(open, id)}
        locked={locked}
        onGo={goTo}
      />

      <PhaseNav
        back={back}
        forward={forward}
        names={Object.fromEntries(phases.map((p) => [p.id, p.name]))}
        onGo={goTo}
      />

      {revising && (
        <RevisionWarning
          name={phases.find((p) => p.id === revising.phaseId)?.name || 'this phase'}
          impact={revising.impact}
          onCancel={() => setRevising(null)}
          onConfirm={confirmRevision}
        />
      )}

      {isSettled(a.phase) && (
        <LockedPhase
          name={current.name}
          items={describePhase(a, a.phase)}
          onUnlock={() => unlock(a.phase)}
        />
      )}

      {withdrewEarly(open) && (
        <p className="gap-note">
          <strong>This crew withdrew on turn {open.withdrewOnTurn}.</strong> No
          VP, no barter flip, no aftermath hand, and the scrip earned this game
          is lost. Everything but the injury flips is skipped — which is the
          book's price for getting out early, not a fault here.
        </p>
      )}

      {showing === 'draw_hand' && (
        <>
          <HankSays>{aftermathReaction({ result: open.result, week })}</HankSays>
          <Field>
            <Label>Phase 1 — draw your aftermath hand</Label>
            <div className="hire__breakdown">
              <span>finished without withdrawing</span>
              <span className="hire__adj">{open.withdrew ? '0' : '+1'}</span>
              <span>{Math.min(open.schemesCompleted, 3)} schemes scored</span>
              <span className="hire__adj">+{Math.min(open.schemesCompleted, 3)}</span>
              <span className="hire__total">{handFor(open)} cards</span>
            </div>
            <p className="note">
              Shuffle, draw that many, and <strong>do not shuffle again until the
              whole aftermath is done</strong>. These cards cheat every flip that
              follows — barter, advancement, the doctor and injuries — one at a
              time and in order. A black joker spent here will not come back on
              the injuries.
            </p>
          </Field>
          <Button onClick={() => { patch({ handSize: handFor(open) }); advance() }}>
            Drawn — on to payday
          </Button>
        </>
      )}

      {showing === 'payday' && (
        <PhasePayday
          game={open}
          record={a}
          onPay={(amount) => {
            if (!a.paid) actions.earnScrip(amount)
            patch({ scripEarned: amount, paid: true })
            advance()
          }}
        />
      )}

      {showing === 'barter' && (
        <PhaseBarter
          week={week}
          arsenal={arsenal}
          record={a.barter}
          handSize={a.handSize}
          onFlip={(next) => patch({ barter: { ...a.barter, ...next, flipped: next.value != null } })}
          onBuy={(entry, thirst) => {
            // The row id is minted here rather than inside `createEquipment`
            // so the record can name the exact row this purchase created.
            // Undoing then removes that row, not merely one that looks like it.
            const rowId = uid('eqp')
            actions.buyEquipment(
              {
                id: rowId, equipmentId: entry.id, name: entry.name,
                cc: entry.cc, page: entry.page, thirst: thirst || isThirst(entry.id),
              },
              entry.cc
            )
            patch({
              barter: {
                ...a.barter,
                bought: [...(a.barter.bought || []), { rowId, equipmentId: entry.id, name: entry.name, cc: entry.cc }],
              },
            })
          }}
          onDone={advance}
        />
      )}

      {showing === 'advance_leader' && (
        <PhaseAdvance
          week={week}
          leader={leader}
          arsenal={arsenal}
          earned={earned}
          record={a.advance}
          onTake={(entry) => {
            // A totem taken from the tier-3 table is not an advancement on the
            // leader — it is the crew gaining a totem, and it does not count
            // toward the rating until the totem itself advances.
            if (entry.tableId === 'totem') {
              actions.setTotem({ name: entry.name, tableValue: entry.tableValue, stats: entry.stats || undefined })
            } else if (entry.tableId === 'crew-card') {
              actions.addCrewCardAdvancement(entry)
            } else if (entry.to === 'totem') {
              actions.advanceTotem(entry)
            } else {
              actions.advanceLeader({ boxes: 0, taken: [entry] })
            }
            patch({ advance: { ...a.advance, taken: [...(a.advance.taken || []), entry] } })
          }}
          onDone={() => {
            // The boxes are checked once, here, rather than one at a time — so a
            // player who abandons the phase halfway has not half-advanced a
            // leader with no record of what the boxes bought.
            const crossed = boxesCrossed(leader.experience?.boxesChecked || 0, earned)
            const alreadyApplied = a.advance.applied
            // The flag is written FIRST, and the order is the whole point.
            // These are two writes; if the second never lands, a reopened phase
            // recomputes `crossed` from the *new* box count and crosses a second
            // set. Writing `applied` first makes a torn write under-advance —
            // visible, and the player can say so — instead of double-advancing,
            // which is silent and unrecoverable. Audit v0.21.1, M1.
            patch({
              advance: {
                ...a.advance,
                experienceEarned: earned,
                applied: true,
                // Recorded rather than recomputed later: once the boxes are
                // checked, `boxesCrossed` reads a different track and would
                // name a different set. The undo needs the number that was
                // actually applied.
                boxesApplied: alreadyApplied ? (a.advance.boxesApplied ?? 0) : crossed.length,
              },
            })
            if (!alreadyApplied && crossed.length) {
              actions.advanceLeader({ boxes: crossed.length, taken: [] })
            }
            advance()
          }}
        />
      )}

      {showing === 'back_alley_doctor' && (
        <PhaseDoctor
          week={week}
          arsenal={arsenal}
          leader={leader}
          record={a.doctor}
          onAttempt={(attempt) => {
            actions.spendScrip(1)
            if (attempt.outcome.heals) actions.healInjury(attempt.injuryId)
            patch({ doctor: { attempts: [...(a.doctor.attempts || []), attempt] } })
          }}
          onDone={advance}
        />
      )}

      {showing === 'determine_injuries' && (
        <PhaseInjuries
          week={week}
          arsenal={arsenal}
          leader={leader}
          game={open}
          record={a.injuries}
          onFlip={(entry) => {
            const rowId = entry.result.attaches ? uid('inj') : null
            if (entry.result.attaches) {
              actions.addInjury({
                id: rowId,
                name: entry.result.name,
                page: entry.result.page,
                modelId: entry.isLeader ? null : entry.modelId,
                titleGroup: entry.titleGroup,
              })
            }
            // `rowId` is what lets a revision detach exactly this injury.
            patch({ injuries: { flips: [...(a.injuries.flips || []), { ...entry, rowId }] } })
          }}
          onFinish={(doomed) => {
            for (const d of doomed) {
              if (!d.isLeader) {
                actions.annihilateModel(d.key)
                continue
              }
              // Fate intervenes exactly once, and the tick is the record of it.
              if (leader.miraculousRecoveryUsed) continue
              actions.useMiraculousRecovery()
              // "If your leader was annihilated due to receiving a third injury
              // and Fate intervenes, no new injury is gained but the previous
              // two remain." Dropped rather than healed: it was never gained,
              // and a `removedAt` would put a visit to Dr. Mo in the ledger
              // that never happened.
              const justAttached = (a.injuries.flips || [])
                .find((f) => f.isLeader && f.result?.attaches)
              const row = justAttached && arsenal.injuries
                .filter((i) => !i.removedAt && !i.modelId && !i.titleGroup)
                .findLast?.((i) => i.name === justAttached.result.name)
              if (row) actions.dropInjury(row.id)
            }
            // Keys as well as names: `annihilateModel` was called with the
            // key, so that is what a revision has to look up to bring a model
            // back. The names stay because they are what the player reads.
            patch({
              done: true,
              annihilated: doomed.filter((d) => !d.isLeader).map((d) => d.key),
              annihilatedNames: doomed.map((d) => d.name),
              locked: (a.locked || []).includes(a.phase) ? (a.locked || []) : [...(a.locked || []), a.phase],
            })
          }}
        />
      )}
    </>
  )
}

/* ── phase 2, small enough to live here ─────────────────────────── */

function PhasePayday({ game, record, onPay }) {
  const b = paydayBreakdown(game)
  return (
    <>
      <Field>
        <Label>Phase 2 — payday</Label>
        {b.forfeited ? (
          <p className="note note--warn">
            Nothing. An early withdrawal loses the scrip earned this game.
          </p>
        ) : (
          <div className="hire__breakdown">
            {b.parts.length === 0 && <span>no scrip earned</span>}
            {b.parts.map((p) => (
              <span key={p.label}>
                {p.label} <span className="hire__adj">+{p.value}</span>
              </span>
            ))}
            <span className="hire__total">{b.total} scrip</span>
          </div>
        )}
        <p className="note">
          One scrip per three VP, rounded up, one more for winning, and the
          difference in campaign ratings if yours was the lower. That last part
          is <strong>uncapped</strong> — unlike the soulstone bonus, which stops
          at three. It reads like an oversight and it is what the book says.
        </p>
      </Field>
      <Button onClick={() => onPay(b.total)} disabled={record.paid}>
        {record.paid ? 'Already collected' : `Collect ${b.total} scrip`}
      </Button>
    </>
  )
}

/* ── chrome ─────────────────────────────────────────────────────── */

/**
 * The six phases, and the way back to any of them.
 *
 * A phase already reached is a button; one not yet played is not, because
 * skipping ahead would mean recording phase five off a phase three that never
 * happened. Skipped phases stay inert and keep saying why.
 */
function PhaseRail({ phases, current, furthestAt, positionOf, locked, onGo }) {
  return (
    <nav className="rail" aria-label="Aftermath phase">
      {phases.map((p) => {
        const pos = positionOf(p.id)
        const reached = !p.skipped && pos >= 0 && pos <= furthestAt
        const isNow = p.id === current
        const state = p.skipped ? 'skip' : isNow ? 'now' : reached ? 'done' : 'todo'
        const shut = locked.includes(p.id)
        const label = `${p.name}${shut ? ' — locked' : ''}`

        if (!reached || isNow) {
          return (
            <span
              key={p.id}
              className={`rail__item rail__item--${state}`}
              aria-current={isNow ? 'step' : undefined}
              title={p.reason || undefined}
            >
              <span className="rail__n">{p.n}</span>
              <span className="rail__name">{p.name}</span>
            </span>
          )
        }
        return (
          <button
            key={p.id}
            type="button"
            className={`rail__item rail__item--${state} rail__item--go`}
            onClick={() => onGo(p.id)}
            title={`Back to ${label}`}
          >
            <span className="rail__n">{shut ? '·' : p.n}</span>
            <span className="rail__name">{p.name}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** Step one phase either way. Forward is bounded by how far the walk has got. */
function PhaseNav({ back, forward, names, onGo }) {
  if (!back && !forward) return null
  return (
    <div className="phasenav">
      {back
        ? <Button ghost onClick={() => onGo(back)}>{`← ${names[back]}`}</Button>
        : <span />}
      {forward
        ? <Button ghost onClick={() => onGo(forward)}>{`${names[forward]} →`}</Button>
        : <span />}
    </div>
  )
}

/**
 * A phase the player has settled.
 *
 * Shows what it recorded and offers the way back in. Revising is a decision
 * with consequences, so it is never one click away from an input the player
 * might touch by accident.
 */
function LockedPhase({ name, items, onUnlock }) {
  return (
    <Field>
      <Label>{name} — locked</Label>
      {items.length > 0 ? (
        <ul className="hire__list">
          {items.map((line, i) => <li key={i}><span>{line}</span></li>)}
        </ul>
      ) : (
        <p className="note">Nothing was recorded here.</p>
      )}
      <p className="note">
        Settled, so it stays put while you move around. Unlock it if it needs
        changing — you will be told what that costs before anything moves.
      </p>
      <Button ghost onClick={onUnlock}>Unlock and revise</Button>
    </Field>
  )
}

/**
 * What revising a phase would unassign, before it happens.
 *
 * Named items rather than a count, because "are you sure?" is unanswerable
 * unless the player can see what they are giving up. It is not a modal: the
 * `.gap-note` styling means it shows with Hank off too, since this is substance
 * rather than narration (§5).
 */
function RevisionWarning({ name, impact, onCancel, onConfirm }) {
  return (
    <div className="gap-note">
      <p>
        <strong>Revising {name} undoes it, and everything after it.</strong>{' '}
        The later phases were decided while this one said something else, so
        they cannot stand — and this one has to come undone before you can
        change it. Everything below goes back to the arsenal: scrip refunded,
        equipment returned, injuries and advancements taken off. Then you walk
        it again from here.
      </p>
      {impact.phases.map((p) => (
        <div key={p.id}>
          <strong>{p.name}</strong>
          <ul className="hire__list">
            {p.items.map((line, i) => <li key={i}><span>{line}</span></li>)}
          </ul>
        </div>
      ))}
      <div className="phasenav">
        <Button ghost onClick={onCancel}>Leave it alone</Button>
        <Button onClick={onConfirm}>Unassign and revise</Button>
      </div>
    </div>
  )
}

function History({ games }) {
  return (
    <Field>
      <Label>Games played</Label>
      <ul className="hire__list">
        {games.map((g) => (
          <li key={g.id}>
            <span>
              Week {g.week}
              {g.opponent ? ` · ${g.opponent}` : ''}
              {g.strategy ? ` · ${g.strategy}` : ''}
            </span>
            <span className="hire__paid">
              {g.result === 'win' ? 'won' : g.result === 'loss' ? 'lost' : g.result === 'draw' ? 'drew' : '—'}
              {' · '}{g.vpSelf}–{g.vpOpponent}
              {g.aftermath?.scripEarned ? ` · +${g.aftermath.scripEarned} scrip` : ''}
            </span>
          </li>
        ))}
      </ul>
    </Field>
  )
}
