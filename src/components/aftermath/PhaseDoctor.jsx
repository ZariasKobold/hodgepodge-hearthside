import { useState } from 'react'
import { Label, Field, Button, Select } from '../ui.jsx'
import HankSays from '../HankSays.jsx'
import FlipInput, { isJoker } from '../FlipInput.jsx'
import { healGreeting, healed, healCantAfford } from '../../data/hank.js'
import {
  doctorOutcome, doctorAffordable, resolveDoctorInjury, DOCTOR_FEE_PER_ATTEMPT,
} from '../../lib/aftermath.js'
import {
  injuriesFor, liveModels, activeInjuryCount,
} from '../../lib/shape/arsenal.js'
/**
 * Phase 5 — Dr. Mo.
 *
 * One scrip per attempt and **the doctor keeps it either way**, which is the
 * only rule here that can feel like a bug if it is not said out loud. So the
 * scrip is spent when the attempt is made rather than when it works, and the
 * screen says so before you pay.
 *
 * Two of the seven results heal an injury and hand you another one; one hands
 * you an injury for nothing. That is the deal, and the flip may be cheated.
 *
 * ## The injury he inflicts is taken here, not somewhere else
 *
 * Until v0.22.6 the screen told the player to "flip on the injury chart for the
 * same model in phase six and record it there", and the arsenal recorded only
 * the healing — so the ledger said "healed, then hurt" over a record that had
 * merely healed. The instruction was also usually impossible: phase 6 flips
 * only for models **killed during the game**, so a patient who survived has no
 * row there to write in.
 *
 * So the follow-up flip happens on this screen, and the attempt cannot be
 * committed until it lands on a result that actually attaches (p.33 — reflip
 * anything that does not). Nothing about that flip is cheatable; see
 * `resolveDoctorInjury`.
 */

/** Every injured subject in the crew, leader included, as one list. */
function injuredSubjects(arsenal, leader) {
  const out = []
  const onLeader = injuriesFor(arsenal, {})
  if (onLeader.length) {
    out.push({ key: 'leader', label: `${leader.name || 'Your leader'} (leader)`, injuries: onLeader, isLeader: true })
  }
  const seenGroups = new Set()
  for (const m of liveModels(arsenal)) {
    if (m.titleGroup) {
      if (seenGroups.has(m.titleGroup)) continue
      seenGroups.add(m.titleGroup)
    }
    const list = injuriesFor(arsenal, m.titleGroup ? { titleGroup: m.titleGroup } : { modelId: m.id })
    if (list.length) out.push({ key: m.id, label: m.name, injuries: list, model: m })
  }
  return out
}

/** What the scrip bought, whether or not it bought anything. */
function Ledger({ attempts }) {
  return (
    <Field>
      <Label>Tonight's ledger</Label>
      <ul className="hire__list">
        {attempts.map((a, i) => (
          <li key={i}>
            <span>{a.injuryName} — {a.outcome.name}</span>
            <span className="hire__paid">
              {a.outcome.net === 'healed' ? 'healed'
                : a.outcome.net === 'traded' ? `healed, then ${a.hurt?.name || 'hurt'}`
                  : a.outcome.net === 'worse' ? (a.hurt?.name || 'made worse')
                    : 'nothing'}
            </span>
          </li>
        ))}
      </ul>
    </Field>
  )
}

export default function PhaseDoctor({ week, arsenal, leader, record, onAttempt, onDone }) {
  const subjects = injuredSubjects(arsenal, leader)
  const total = activeInjuryCount(arsenal)
  const attempts = record.attempts || []

  const [pick, setPick] = useState({ subject: '', injuryId: '' })
  const [flip, setFlip] = useState({ value: null, suit: null, cheated: false })
  /** The second flip, for the two results that hand out an injury. */
  const [hurt, setHurt] = useState({ value: null, suit: null })

  const subject = subjects.find((s) => s.key === pick.subject) || null
  const injury = subject?.injuries.find((i) => i.id === pick.injuryId) || null
  const canPay = doctorAffordable(arsenal.scrip)
  const outcome = flip.value != null ? doctorOutcome(flip.value) : null

  /**
   * What the patient already carries, so a result they have is thrown back and
   * a result their kind cannot take is too. The same facts `PhaseInjuries`
   * assembles, from the same place.
   */
  const patient = subject
    ? {
      isLeader: Boolean(subject.isLeader),
      isTotem: false,
      injuryNames: subject.injuries.map((i) => i.name),
    }
    : {}

  const wounds = Boolean(outcome?.addsInjury)
  const hurtResult = wounds && hurt.value != null
    ? resolveDoctorInjury(hurt.value, hurt.suit, patient)
    : null
  const hurtNeedsSuit = hurt.value != null && !isJoker(hurt.value) && !hurt.suit
  const hurtReady = !wounds || Boolean(hurtResult?.attaches)

  function reset() {
    setPick({ subject: '', injuryId: '' })
    setFlip({ value: null, suit: null, cheated: false })
    setHurt({ value: null, suit: null })
  }

  function commit() {
    if (!injury || !outcome || !canPay || !hurtReady) return
    onAttempt({
      subjectKey: subject.key,
      isLeader: Boolean(subject.isLeader),
      modelId: subject.model?.id ?? null,
      titleGroup: subject.model?.titleGroup ?? null,
      injuryId: injury.id,
      injuryName: injury.name,
      flip: flip.value,
      cheated: flip.cheated,
      outcome,
      /** The injury he gave in exchange, if he gave one. */
      hurt: hurtResult
        ? { value: hurt.value, suit: hurt.suit, name: hurtResult.name, page: hurtResult.page }
        : null,
    })
    reset()
  }

  /**
   * Nothing left to mend — which is a different screen from "nobody was hurt",
   * because healing the last injury lands here too. The ledger stays: it is the
   * record of the scrip just spent, and dropping it the instant it succeeded
   * would leave a player looking at an empty page wondering what they paid for.
   */
  if (total === 0) {
    return (
      <>
        <HankSays>{healGreeting({ week, injuryCount: 0 })}</HankSays>
        {attempts.length > 0 && <Ledger attempts={attempts} />}
        <p className="note">
          {attempts.length
            ? 'Nothing left to mend. Dr. Mo has had his scrip and everyone is walking.'
            : 'Nobody is carrying an injury. Nothing for the doctor to do.'}
        </p>
        {attempts.length > 0 && <HankSays>{healed({ week, cleared: true })}</HankSays>}
        <Button onClick={onDone}>Move on</Button>
      </>
    )
  }

  return (
    <>
      <HankSays>{healGreeting({ week, injuryCount: total })}</HankSays>

      <div className="hire__ledger">
        <span><strong>{total}</strong> injuries in the crew</span>
        <span><strong>{arsenal.scrip}</strong> scrip</span>
        <span><strong>{attempts.length}</strong> attempts this aftermath</span>
      </div>

      <p className="gap-note">
        <strong>{DOCTOR_FEE_PER_ATTEMPT} scrip per attempt, kept either way.</strong>{' '}
        The flip decides what he manages; the fee is for showing up. Two results
        heal the injury and give a new one, and the black joker gives one for
        nothing — you flip for that injury here and it is attached here. His
        flip may be cheated from your aftermath hand; the injury flip may not.
      </p>

      {attempts.length > 0 && <Ledger attempts={attempts} />}

      {!canPay && <HankSays>{healCantAfford({ week })}</HankSays>}

      <div className="hire__quote">
        <Field>
          <Label>Who is on the table</Label>
          <Select
            value={pick.subject}
            onChange={(e) => setPick({ subject: e.target.value, injuryId: '' })}
            disabled={!canPay}
          >
            <option value="">Choose a model…</option>
            {subjects.map((s) => (
              <option key={s.key} value={s.key}>{s.label} — {s.injuries.length} injuries</option>
            ))}
          </Select>
        </Field>

        {subject && (
          <Field>
            <Label>Which injury</Label>
            <Select
              value={pick.injuryId}
              onChange={(e) => setPick({ ...pick, injuryId: e.target.value })}
            >
              <option value="">Choose one…</option>
              {subject.injuries.map((i) => (
                <option key={i.id} value={i.id}>{i.name}{i.page ? ` · p.${i.page}` : ''}</option>
              ))}
            </Select>
          </Field>
        )}

        {injury && (
          <FlipInput
            label="The doctor's flip"
            value={flip.value}
            cheated={flip.cheated}
            onChange={(next) => setFlip({ ...next, suit: null })}
            needsSuit={false}
          />
        )}

        {outcome && injury && (
          <div className="hire__breakdown">
            <span>{outcome.name}</span>
            <span className="hire__adj">p.{outcome.page}</span>
            <span className="hire__total">
              {outcome.net === 'healed' ? 'healed'
                : outcome.net === 'traded' ? `healed, and ${hurtResult?.attaches ? hurtResult.name : 'a new injury'}`
                : outcome.net === 'worse' ? (hurtResult?.attaches ? hurtResult.name : 'a new injury')
                  : 'no change'}
            </span>
          </div>
        )}

        {outcome?.grantsCharacteristic && (
          <p className="note">
            The model gains the {outcome.grantsCharacteristic} characteristic.
            Note it on the roster — this app does not track characteristics per
            model.
          </p>
        )}

        {wounds && (
          <Field>
            <Label>The injury it costs — flip on the injury chart (p.34)</Label>
            <FlipInput
              label={`What did ${subject?.label || 'the patient'} flip?`}
              value={hurt.value}
              suit={hurt.suit}
              onChange={(next) => setHurt({ value: next.value, suit: next.suit })}
              needsCheated={false}
            />
            <p className="gap-note">
              <strong>Anything that does not injure goes back.</strong> p.33 says
              to reflip jokers and any result that does not give the model an
              injury, killed off included — so this one keeps asking until it
              lands on something that attaches. It is the one flip here you may
              not cheat.
            </p>
            {hurtNeedsSuit && <p className="note">Which suit?</p>}
            {hurtResult && (
              <p className={hurtResult.attaches ? 'note' : 'note note--warn'}>
                {hurtResult.attaches
                  ? `${hurtResult.name} · p.${hurtResult.page} — this one sticks.`
                  : `${hurtResult.name} — flip again, ${hurtResult.reflipWhy}.`}
              </p>
            )}
          </Field>
        )}

        {outcome?.luckyMiss === 'ifFlipped' && !flip.cheated && (
          <p className="note">
            Flipped rather than cheated, so flip again on Lucky Miss (p.36) and
            apply that to the model as well.
          </p>
        )}

        <Button onClick={commit} disabled={!injury || !outcome || !canPay || !hurtReady}>
          {wounds && !hurtReady
            ? 'Flip for the injury first'
            : `Pay ${DOCTOR_FEE_PER_ATTEMPT} scrip and apply`}
        </Button>
      </div>

      {attempts.length > 0 && (
        <HankSays>
          {healed({ week, cleared: activeInjuryCount(arsenal) === 0 })}
        </HankSays>
      )}

      {/* No line for skipping. `healSkipped` reads as Hank accepting a decision
          the player has not made yet — the timing rule (§2) — and this screen
          has no later moment to say it in, because skipping ends the phase. */}
      <Button onClick={onDone}>
        {attempts.length ? 'Done with the doctor' : 'Skip the doctor'}
      </Button>
    </>
  )
}
