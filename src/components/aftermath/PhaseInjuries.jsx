import { useState } from 'react'
import { Label, Field, Button } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import FlipInput, { isJoker } from '../FlipInput.jsx'
import { injuryLine, annihilationLine, miraculousRecovery, leaderLost } from '../../data/hank.js'
import {
  resolveInjuryFlip, resolveLuckyMiss, doomedSubjects, ANNIHILATION_THRESHOLD,
} from '../../lib/aftermath.js'
import { REFLIP_REASONS } from '../../data/injuries.js'
import {
  injuryNamesFor, injuriesFor, liveModels,
} from '../../lib/shape/arsenal.js'
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

  /**
   * **Everyone**, not only the models that flipped.
   *
   * p.36: "After flipping for injuries, all models with three or more injury
   * upgrades attached are annihilated" — and the paragraph above it says so
   * deliberately, naming a model that gained an injury "in some other manner
   * (such as from the Mutagen Injector equipment in the middle of a game)" and
   * survives until exactly this check. This used to count only `subjects`, so a
   * model that reached three by any other route walked away. Dr. Mo is the
   * common route and his injuries have been recorded since v0.22.6, which is
   * what made the hole reachable rather than theoretical.
   *
   * Grouped by title the way `injuriesFor` groups them, so two copies of one
   * model are one subject and are not counted twice.
   */
  const everyone = [
    { key: 'leader', name: leader.name || 'Your leader', isLeader: true },
    ...(() => {
      const seen = new Set()
      return liveModels(arsenal).filter((m) => {
        if (!m.titleGroup) return true
        if (seen.has(m.titleGroup)) return false
        seen.add(m.titleGroup)
        return true
      })
    })().map((m) => ({ key: m.id, name: m.name, model: m })),
  ]

  const countFor = (s) => (s.isLeader
    ? injuriesFor(arsenal, {})
    : injuriesFor(arsenal, s.model?.titleGroup ? { titleGroup: s.model.titleGroup } : { modelId: s.key })
  ).length

  const killedOffKeys = flips.filter((f) => f.result?.annihilates).map((f) => f.subjectKey)
  const doomed = doomedSubjects(everyone, countFor, killedOffKeys)
  const leaderDoomed = doomed.some((d) => d.isLeader)
  const anyInjured = flips.some((f) => f.result?.attaches)

  /**
   * Nobody died — which is not the same as nobody being annihilated.
   *
   * This branch used to close the aftermath with `onFinish([])`, skipping the
   * end-of-phase check altogether. p.36 puts no condition on that check: "after
   * flipping for injuries, all models with three or more injury upgrades
   * attached are annihilated", and a crew where nobody fell can still contain
   * someone Dr. Mo pushed to three a minute ago. So there is nothing to *flip*
   * for, and there may still be someone to carry off.
   */
  if (subjects.length === 0) {
    return (
      <>
        <p className="note">Nobody died. There is nothing to flip for.</p>
        {doomed.length > 0 && (
          <Field>
            <Label>Still too hurt to go on</Label>
            <ul className="hire__list">
              {doomed.map((d) => (
                <li key={d.key}>
                  <span>{d.name}</span>
                  <span className="hire__paid">
                    {d.isLeader && !leader.miraculousRecoveryUsed
                      ? 'Fate intervenes — the first time only'
                      : `${ANNIHILATION_THRESHOLD} injuries — annihilated`}
                  </span>
                </li>
              ))}
            </ul>
          </Field>
        )}
        {leaderDoomed && (
          <HankSays tone="grave">
            {leader.miraculousRecoveryUsed ? leaderLost({ week }) : miraculousRecovery({ week })}
          </HankSays>
        )}
        {doomed.length > 0 && !leaderDoomed && (
          <HankSays tone="grave">{annihilationLine({ isLeader: false, week })}</HankSays>
        )}
        <Button onClick={() => onFinish(doomed)}>Close the aftermath</Button>
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
                Everyone is still in the arsenal. Nobody in the crew is carrying{' '}
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
