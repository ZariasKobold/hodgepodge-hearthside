import { Label, Button } from './ui.jsx'
import { planRepair, describeRepair } from '../lib/repair.js'

/**
 * Putting back what the lost update ate.
 *
 * A reconcile in flight used to overwrite an arsenal with its own opening
 * snapshot (fixed in v0.24.0 by `settleAfterPush`). The bug cannot recur; the
 * damage it already did does not undo itself, and one arsenal on the database
 * is still missing a Gatling Gun, three advancements and three experience
 * boxes its own game record says were earned.
 *
 * ## It shows the whole bill before it does anything
 *
 * Every line is named — the advancements with the action each went on, the
 * equipment with what it cost, the boxes. **"3 items" is not something a player
 * can check against their own table; "Gatling Gun" is.** The scrip arithmetic
 * is spelled out for the same reason: this is a repair for a bug that silently
 * changed somebody's numbers, so it would be a poor sort of repair if it also
 * silently changed somebody's numbers.
 *
 * ## Why the scrip line matters
 *
 * The record says the equipment was paid for and that spend never happened, so
 * putting the row back without the cost hands over a free Gatling Gun. But the
 * balance can floor at zero — and the same arsenal is usually owed its p. 15
 * starting scrip as well, which is worth claiming *first*. The panel says so
 * rather than quietly rounding.
 *
 * ## It vanishes when it is done and cannot double-apply
 *
 * `planRepair` is a delta against the record, recomputed on every render, so a
 * second press finds nothing missing. The panel disappears because the arsenal
 * is whole, which is the only disappearance worth trusting.
 */
export default function RepairAftermath({ arsenal, campaign, onRepair }) {
  const plan = planRepair({ arsenal, campaign })
  if (!plan?.any || !onRepair) return null

  const lines = describeRepair(plan)
  const { spend, from, to, floored } = plan.scrip

  return (
    <section className="repair repair--drift">
      <Label>An aftermath never reached this leader</Label>

      <p className="gap-note">
        <strong>The game record holds more than the arsenal does.</strong>{' '}
        A sync bug that has since been fixed overwrote this leader with an older
        copy of itself, so work you did in an aftermath was recorded on the game
        and lost from the arsenal. Nothing about the record was damaged, so all
        of it can be put back exactly as it was.
      </p>

      <ul className="repair__list">
        {lines.map((line, i) => <li key={i}>{line}</li>)}
      </ul>

      {spend > 0 && (
        <p className="note">
          The equipment was paid for in the record and never taken off the
          balance, so putting it back costs {spend} scrip:{' '}
          <strong>{from} → {to}</strong>.
        </p>
      )}

      {floored && (
        // Named rather than absorbed. The arsenal that hit this in practice was
        // also owed its p. 15 starting scrip, and claiming that first is the
        // difference between the right number and a floored one.
        <p className="note note--warn">
          That would take the balance below zero, so it floors at 0 — and{' '}
          <strong>a scrip you are owed elsewhere is worth claiming first</strong>.
          If this leader is still owed its starting scrip, take that, then come
          back here.
        </p>
      )}

      {plan.unplaceable.length > 0 && (
        <p className="note note--warn">
          {plan.unplaceable.map((e) => e.name).join(', ')} went to a totem this
          arsenal no longer has, so there is nowhere to put it back. It stays in
          the game record.
        </p>
      )}

      <div className="repair__go">
        <Button onClick={onRepair}>Put it back</Button>
      </div>
    </section>
  )
}
