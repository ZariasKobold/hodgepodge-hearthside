import { Label, Button, Chip } from './ui.jsx'
import { keptTriggerProblem, availableTriggers } from '../lib/validation.js'
import { getArchetype } from '../data/archetypes.js'

/**
 * A trigger kept at creation that the leader is not allowed to keep.
 *
 * Only the Heavy Hitter keeps one, from the attack action it took (p. 17).
 * `checkStructure` enforces that while the leader is being built, and nothing
 * looked again after — so a leader who chose a trigger and then changed
 * archetype, or swapped the attack action, carried it on the record for good.
 * The wizard hides the trigger picker for every archetype but one, so there was
 * no control anywhere that could take it off. A player found exactly that.
 *
 * This is the control. It renders nothing unless `keptTriggerProblem` proves a
 * fault, so a healthy leader never sees it.
 */
export default function KeptTriggerRepair({ leader, onSetTrigger }) {
  const problem = keptTriggerProblem(leader)
  if (!problem || !onSetTrigger) return null

  const archetype = getArchetype(leader.archetype)
  // A Heavy Hitter whose trigger is simply the wrong one can pick the right one
  // here. Anyone else can only take it off.
  const offered = archetype?.keepsTrigger ? availableTriggers(leader.picks) : []
  const nameOf = (t) => t?.name ?? t

  return (
    <section className="repair noprint">
      <Label>A trigger this leader cannot keep</Label>
      <p className="gap-note">
        <strong>{leader.trigger}</strong> is on this leader from creation.{' '}
        {problem.why}. It is printed on the record and the arsenal sheet as though
        it were earned, so it needs to come off
        {offered.length > 0 ? ', or be swapped for one the attack action really has' : ''}.
      </p>

      {offered.length > 0 && (
        <div className="chips">
          {offered.map((t) => (
            <Chip key={nameOf(t)} on={false} onClick={() => onSetTrigger(nameOf(t))}>
              Keep {nameOf(t)} instead
            </Chip>
          ))}
        </div>
      )}

      <div className="repair__go">
        <Button onClick={() => onSetTrigger('')}>Take {leader.trigger} off</Button>
      </div>
    </section>
  )
}
