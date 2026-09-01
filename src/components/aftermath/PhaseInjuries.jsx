import { useState } from 'react'
import { Label, Field, Button } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import FlipInput, { isJoker } from '../FlipInput.jsx'
import { injuryLine, annihilationLine, miraculousRecovery, leaderLost } from '../../data/hank.js'
import { resolveInjuryFlip, resolveLuckyMiss, ANNIHILATION_THRESHOLD } from '../../lib/aftermath.js'
import { REFLIP_REASONS } from '../../data/injuries.js'
import { injuryNamesFor, injuriesFor } from '../../lib/campaignShape.js'

/**
 * Phase 6 — one flip per model that died, and the only phase a forfeited
 * aftermath still plays.
 *
 * Two rules here are easy to get wrong and both are load-bearing:
 *
 * **Reflips are conditional on the model, not on the flip.** Permanent Hex on a
 * model with no triggers, Mangled Limb on one with no attack actions, Headstrong
 * on a master — each is thrown back and flipped again. The app cannot read a
 * stat card, so it asks; a wrong answer here is an injury that should not exist,
 * and injuries subtract from the campaign rating for the rest of the campaign.
 *
 * **Annihilation is checked at the END of the phase, never during it.** A model
 * can reach three injuries mid-game (the Mutagen Injector does exactly that) and
 * still fights on until this moment. Counting as you go would remove it a phase
 * early and take its cost out of the arsenal total while barter was still open.
 */

function subjectLabel(s) {
  return s.isLeader ? `${s.name} (leader)` : s.name
}

export default function PhaseInjuries({
  week, arsenal, leader, game, record, onFlip, onFinish,
}) {
  const flips = record.flips || []

  // Everything that died: the leader if they fell, plus every non-peon model
  // ticked on the game log. Peons never flip at all.
  const subjects = [
    ...(game.leaderWasKilled ? [{ key: 'leader', name: leader.name || 'Your leader', isLeader: true }] : []),
    ...(game.killedModelIds || [])
      .map((id) => arsenal.models.find((m) => m.id === id))
      .filter((m) => m && !m.peon)
      .map((m) => ({ key: m.id, name: m.name, model: m })),
  ]

  const pending = subjects.filter((s) => !flips.some((f) => f.subjectKey === s.key))
  const current = pending[0] || null

  const [flip, setFlip] = useState({ value: null, suit: null, cheated: false })
  const [traits, setTraits] = useState({})
  const [luckyValue, setLuckyValue] = useState(null)

  const model = current?.model
  const known = current
    ? {
        isLeader: Boolean(current.isLeader),
        isTotem: false,
        injuryNames: injuryNamesFor(arsenal, model),
        ...traits,
      }
    : {}

  const result = current && flip.value != null
    ? resolveInjuryFlip(flip.value, flip.suit, known, { cheated: flip.cheated })
    : null

  const lucky = result?.luckyMiss && luckyValue != null
    ? resolveLuckyMiss(luckyValue, known)
    : null

  const needsSuit = flip.value != null && !isJoker(flip.value) && !flip.suit

  function commit() {
    if (!current || !result) return
    onFlip({
      subjectKey: current.key,
      subjectName: current.name,
      isLeader: Boolean(current.isLeader),
      modelId: model?.id ?? null,
      titleGroup: model?.titleGroup ?? null,
      value: flip.value,
      suit: flip.suit,
      cheated: flip.cheated,
      result,
      lucky,
    })
    setFlip({ value: null, suit: null, cheated: false })
    setTraits({})
    setLuckyValue(null)
  }

  /* ── the end-of-phase check ───────────────────────────────────── */

  const counts = {}
  for (const s of subjects) {
    const list = s.isLeader
      ? injuriesFor(arsenal, {})
      : injuriesFor(arsenal, s.model?.titleGroup ? { titleGroup: s.model.titleGroup } : { modelId: s.key })
    counts[s.key] = list.length
  }
  const overThreshold = subjects.filter((s) => counts[s.key] >= ANNIHILATION_THRESHOLD)
  const killedOff = flips.filter((f) => f.result?.annihilates)
  const doomed = [
    ...overThreshold,
    ...killedOff
      .filter((f) => !overThreshold.some((s) => s.key === f.subjectKey))
      .map((f) => ({ key: f.subjectKey, name: f.subjectName, isLeader: f.isLeader })),
  ]
  const leaderDoomed = doomed.some((d) => d.isLeader)
  const anyInjured = flips.some((f) => f.result?.attaches)

  if (subjects.length === 0) {
    return (
      <>
        <p className="note">Nobody died. There is nothing to flip for.</p>
        <Button onClick={() => onFinish([])}>Close the aftermath</Button>
      </>
    )
  }

  return (
    <>
      <div className="hire__ledger">
        <span><strong>{flips.length}</strong> of {subjects.length} flipped</span>
        <span>three injuries is out</span>
      </div>

      {flips.length > 0 && (
        <Field>
          <Label>Flipped so far</Label>
          <ul className="hire__list">
            {flips.map((f, i) => (
              <li key={i}>
                <span>{f.subjectName}</span>
                <span className="hire__paid">
                  {f.result.attaches ? f.result.name
                    : f.result.annihilates ? `${f.result.name} — annihilated`
                    : f.result.duplicate ? `${f.result.name} — already had it`
                    : f.result.name}
                  {f.lucky ? ` · ${f.lucky.name}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Field>
      )}

      {current && (
        <div className="hire__quote">
          <Label>Flipping for {subjectLabel(current)}</Label>

          <FlipInput
            label=""
            value={flip.value}
            suit={flip.suit}
            cheated={flip.cheated}
            onChange={(next) => { setFlip(next); setLuckyValue(null) }}
          />

          {needsSuit && <p className="note">Which suit? Rams and Masks read one column, Crows and Tomes the other.</p>}

          {result && (
            <>
              <div className="hire__breakdown">
                <span>{result.name}</span>
                <span className="hire__adj">p.{result.page}</span>
                <span className="hire__total">
                  {result.reflip ? 'reflip'
                    : result.duplicate ? 'no injury — already had it'
                    : result.annihilates ? 'annihilated'
                    : result.attaches ? 'injury' : 'no injury'}
                </span>
              </div>

              {/* The condition is about the model, and the app has never seen
                  the model's card. Asked rather than assumed. */}
              {result.reflipIf && !['leaderOrTotem', 'masterOrTotem'].includes(result.reflipIf) && (
                <label className="hire__check">
                  <input
                    type="checkbox"
                    checked={Boolean(traits[traitKeyFor(result.reflipIf)] === traitValueFor(result.reflipIf))}
                    onChange={(e) =>
                      setTraits(e.target.checked
                        ? { ...traits, [traitKeyFor(result.reflipIf)]: traitValueFor(result.reflipIf) }
                        : {})
                    }
                  />
                  {REFLIP_REASONS[result.reflipIf]} — throw it back and flip again
                </label>
              )}

              {result.reflip && (
                <p className="note note--warn">
                  Reflip: {REFLIP_REASONS[result.reflipIf]}. Flip a new card
                  above; this one does not stand.
                </p>
              )}

              {result.duplicate && (
                <p className="note">
                  {current.name} already carries {result.name}, so it is not
                  applied again — they got lucky and suffer no injury this game.
                </p>
              )}

              {result.defects && !result.reflip && (
                <p className="note note--warn">
                  <strong>Traitor.</strong> This model leaves your arsenal and
                  joins the opposing crew's, keeping its injuries and equipment.
                  Tell them; they add it for nothing.
                </p>
              )}

              {result.luckyMiss && (
                <Field>
                  <Label>Lucky Miss — flip again (p.36)</Label>
                  <FlipInput
                    label=""
                    value={luckyValue}
                    onChange={(next) => setLuckyValue(next.value)}
                    needsSuit={false}
                    needsCheated={false}
                  />
                  {lucky && (
                    <p className="note">
                      {lucky.reflip
                        ? `${lucky.name} — reflip, ${REFLIP_REASONS[lucky.reflipIf]}.`
                        : `${lucky.name} · p.${lucky.page}. All Lucky Miss results are good and none of them touch the campaign rating.`}
                    </p>
                  )}
                </Field>
              )}

              <Button onClick={commit} disabled={result.reflip || needsSuit}>
                Record it
              </Button>
            </>
          )}
        </div>
      )}

      {anyInjured && <HankSays>{injuryLine({ week })}</HankSays>}

      {!current && (
        <>
          <Field>
            <Label>End of the phase — who is too hurt to go on</Label>
            {doomed.length === 0 ? (
              <p className="note">
                Everyone who fell is still in the arsenal. Nobody reached{' '}
                {ANNIHILATION_THRESHOLD} injuries.
              </p>
            ) : (
              <ul className="hire__list">
                {doomed.map((d) => (
                  <li key={d.key}>
                    <span>{d.name}</span>
                    <span className="hire__paid">
                      {d.isLeader && !leader.miraculousRecoveryUsed
                        ? 'Fate intervenes — the first time only'
                        : 'annihilated'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          {leaderDoomed && !leader.miraculousRecoveryUsed && (
            <>
              <HankSays tone="grave">{miraculousRecovery({ week })}</HankSays>
              <p className="gap-note">
                <strong>Miraculous recovery.</strong> The first time your leader
                would be annihilated, tick the box and ignore the result
                entirely. If it was a third injury that did it, no new injury is
                gained and the previous two remain. The second time, it stands.
              </p>
            </>
          )}

          {leaderDoomed && leader.miraculousRecoveryUsed && (
            <>
              <HankSays tone="grave">{leaderLost({ week })}</HankSays>
              <p className="gap-note">
                <strong>Your leader is gone.</strong> Fate has already stepped in
                once and does not again. Retire this crew and start anew (p.37) —
                a new arsenal, with 5 extra scrip for every week the campaign has
                run past the first.
              </p>
            </>
          )}

          {doomed.length > 0 && !leaderDoomed && (
            <HankSays tone="grave">{annihilationLine({ isLeader: false, week })}</HankSays>
          )}

          <Button onClick={() => onFinish(doomed)}>Close the aftermath</Button>
        </>
      )}
    </>
  )
}

/* The reflip conditions the player has to answer, mapped onto the trait shape
   `resolveInjuryFlip` reads. Two of them — leader and master — the app already
   knows, so they never reach the checkbox. */
function traitKeyFor(condition) {
  switch (condition) {
    case 'noTriggers': return 'hasTriggers'
    case 'noAttackActions': return 'hasAttackActions'
    case 'insignificant': return 'insignificant'
    case 'noSignatureSymbols': return 'hasSignatureSymbols'
    default: return 'unknown'
  }
}

function traitValueFor(condition) {
  return condition === 'insignificant' ? true : false
}
