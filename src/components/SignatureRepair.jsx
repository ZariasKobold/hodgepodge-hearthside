import { Label, Chip } from './ui.jsx'
import { unansweredSignatures, pickSignature } from '../lib/signature.js'

/**
 * Yes or no: is this chosen action a signature action on its card?
 *
 * Asked of the player because the register's flag is wrong (lib/signature.js).
 * Both answers are buttons rather than a checkbox, because an unticked box
 * reads as "no" and the whole point is that unanswered is not no.
 */
export function SignatureAnswer({ pick, onAnswer }) {
  const answer = pickSignature(pick)
  return (
    <div className="signature">
      <span className="pick__meta">Signature action on its card?</span>
      <div className="chips">
        <Chip on={answer === true} onClick={() => onAnswer(answer === true ? null : true)}>Yes</Chip>
        <Chip on={answer === false} onClick={() => onAnswer(answer === false ? null : false)}>No</Chip>
      </div>
    </div>
  )
}

/**
 * The same question for every leader built before it was asked.
 *
 * Renders nothing once each chosen action has an answer, and never returns:
 * a wrong answer is changed by editing the leader, where the question sits
 * under every action. Reported on the outstanding bar too, so nobody has to
 * find this panel to learn it exists (v0.23.0).
 */
export default function SignatureRepair({ leader, onAnswer }) {
  const unanswered = unansweredSignatures(leader)
  if (!onAnswer || unanswered.length === 0) return null

  return (
    <section className="repair noprint">
      <Label>Which of these are signature actions?</Label>
      <p className="gap-note">
        A chosen action keeps any signature symbol it has on the card it came
        from (p. 17). The card data this app reads does not say so reliably, so
        it has to come from you. Check each card. The export carries your answer.
      </p>
      {unanswered.map(({ slot, pick }) => (
        <div className="repair__row" key={pick.key}>
          <div className="pick__name">{pick.name}</div>
          <div className="pick__meta">from {pick.model}</div>
          <SignatureAnswer pick={pick} onAnswer={(value) => onAnswer(slot, pick.key, value)} />
        </div>
      ))}
    </section>
  )
}
