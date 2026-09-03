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

  const advance = () => {
    const to = nextPhase(open, a.phase)
    if (to) patch({ phase: to })
    else patch({ done: true })
  }

  const earned = experienceFor(open, leader)

  return (
    <>
      <PhaseRail phases={phases} current={a.phase} />

      {withdrewEarly(open) && (
        <p className="gap-note">
          <strong>This crew withdrew on turn {open.withdrewOnTurn}.</strong> No
          VP, no barter flip, no aftermath hand, and the scrip earned this game
          is lost. Everything but the injury flips is skipped — which is the
          book's price for getting out early, not a fault here.
        </p>
      )}

      {a.phase === 'draw_hand' && (
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

      {a.phase === 'payday' && (
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

      {a.phase === 'barter' && (
        <PhaseBarter
          week={week}
          arsenal={arsenal}
          record={a.barter}
          handSize={a.handSize}
          onFlip={(next) => patch({ barter: { ...a.barter, ...next, flipped: next.value != null } })}
          onBuy={(entry, thirst) => {
            actions.buyEquipment(
              { equipmentId: entry.id, name: entry.name, cc: entry.cc, page: entry.page, thirst: thirst || isThirst(entry.id) },
              entry.cc
            )
            patch({ barter: { ...a.barter, bought: [...(a.barter.bought || []), entry.id] } })
          }}
          onDone={advance}
        />
      )}

      {a.phase === 'advance_leader' && (
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
            if (!a.advance.applied && crossed.length) {
              actions.advanceLeader({ boxes: crossed.length, taken: [] })
            }
            patch({
              advance: { ...a.advance, experienceEarned: earned, applied: true },
            })
            advance()
          }}
        />
      )}

      {a.phase === 'back_alley_doctor' && (
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

      {a.phase === 'determine_injuries' && (
        <PhaseInjuries
          week={week}
          arsenal={arsenal}
          leader={leader}
          game={open}
          record={a.injuries}
          onFlip={(entry) => {
            if (entry.result.attaches) {
              actions.addInjury({
                name: entry.result.name,
                page: entry.result.page,
                modelId: entry.isLeader ? null : entry.modelId,
                titleGroup: entry.titleGroup,
              })
            }
            patch({ injuries: { flips: [...(a.injuries.flips || []), entry] } })
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
            patch({ done: true, annihilated: doomed.map((d) => d.name) })
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

function PhaseRail({ phases, current }) {
  return (
    <nav className="rail" aria-label="Aftermath phase">
      {phases.map((p) => {
        const state = p.skipped ? 'skip' : p.id === current ? 'now' : 'todo'
        return (
          <span
            key={p.id}
            className={`rail__item rail__item--${state}`}
            aria-current={p.id === current ? 'step' : undefined}
            title={p.reason || undefined}
          >
            <span className="rail__n">{p.n}</span>
            <span className="rail__name">{p.name}</span>
          </span>
        )
      })}
    </nav>
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
