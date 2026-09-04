import { useState } from 'react'
import { Button, Label } from './ui.jsx'
import { describeConflict } from '../lib/shape/compare.js'

/**
 * Two copies of the same leader disagree. Which did you mean?
 *
 * ## It never interrupts
 *
 * This renders on the shelf and waits. The conflicted state is *safe* — both
 * copies are intact and nothing has been overwritten — so it can sit for a week
 * without costing anything. Being asked "which copy of your leader is real?"
 * three phases into an aftermath, at a table, would be the app choosing the
 * worst possible moment to demand a decision it could have asked about on
 * Thursday. No modal, no redirect, no blocking the wizard.
 *
 * ## It shows facts, not versions
 *
 * "Version 4 versus version 7" is a coin toss. `describeConflict` turns the two
 * documents into the numbers a player recognises and, more importantly, into
 * what each side has that the other does not — "yours has Nekima hired in week
 * 3, theirs has a broken arm on the Terror Tot". That is a five-second decision.
 *
 * ## Keep both is the recommended answer
 *
 * It is the only one that cannot be wrong. Both copies stay, the choice becomes
 * reversible, and the loser can be discarded next week once its owner is sure.
 * Every other option is offered underneath it, and the file with both sides in
 * is offered above all of them.
 */
export default function ConflictNotice({ conflict, onResolve, onDownload }) {
  const [busy, setBusy] = useState(false)
  const c = describeConflict(conflict)
  const isArsenal = conflict.kind === 'arsenal'
  const noun = isArsenal ? 'leader' : 'campaign'
  const name = c.mine.summary?.leader || c.mine.summary?.name || 'this ' + noun

  const choose = (choice) => {
    setBusy(true)
    try { onResolve?.(conflict.id, choice) } finally { setBusy(false) }
  }

  return (
    <section className="gap-note" role="group" aria-label={`Sync conflict for ${name}`}>
      <strong>{name} was edited in two places.</strong>{' '}
      This device and your account both changed it since they last agreed.{' '}
      <strong>Nothing has been overwritten</strong> — both copies are safe, and
      nothing will change until you pick one.

      <div className="conflict__grid">
        <ConflictColumn title="On this device" side={c.mine} sets={c.sets} which="onlyMine" />
        <ConflictColumn title="On your account" side={c.theirs} sets={c.sets} which="onlyTheirs" />
      </div>

      {c.differences.length > 0 && (
        <table className="conflict__table">
          <thead>
            <tr><th /><th>This device</th><th>Your account</th></tr>
          </thead>
          <tbody>
            {c.differences.map((d) => (
              <tr key={d.key}>
                <th scope="row">{d.label}</th>
                <td>{format(d.mine)}</td>
                <td>{format(d.theirs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* The escape hatch comes first, and before any choice is made. §8 treats
          portability as a requirement, and this is the moment it matters most. */}
      <p className="note" style={{ marginTop: 12 }}>
        <button className="gate__link" onClick={() => onDownload?.(conflict.id)}>
          Download both copies first
        </button>{' '}
        — one JSON file with each side in it. Importing files them as new;
        nothing is overwritten.
      </p>

      <div className="conflict__actions">
        {isArsenal && (
          <Button disabled={busy} onClick={() => choose('both')}>
            Keep both
          </Button>
        )}
        <Button ghost disabled={busy} onClick={() => choose('mine')}>
          Keep this device&rsquo;s
        </Button>
        <Button ghost disabled={busy} onClick={() => choose('theirs')}>
          Keep my account&rsquo;s
        </Button>
      </div>

      <p className="note">
        {isArsenal ? (
          <>
            <strong>Keep both</strong> is the safe answer: the copy from this
            device becomes a second {noun} on the shelf, so you can compare them
            properly and discard one later. The other two options replace one
            copy with the other.
          </>
        ) : (
          <>
            Keeping both is not offered for a campaign — a second copy of a table
            would leave its players pointing at the first one, which turns one
            disagreement into several. Download both above if you want the loser
            kept.
          </>
        )}
      </p>
    </section>
  )
}

function ConflictColumn({ title, side, sets, which }) {
  const only = sets.flatMap((s) => side ? s[which].map((label) => ({ group: s.label, label })) : [])
  return (
    <div className="conflict__col">
      <Label>{title}</Label>
      <p className="note" style={{ margin: '2px 0 8px' }}>
        {side.updatedAt ? `last saved ${when(side.updatedAt)}` : 'no save time recorded'}
      </p>
      {only.length === 0 ? (
        <p className="note">Nothing the other copy is missing.</p>
      ) : (
        <ul className="hire__list">
          {only.map((o, i) => (
            <li key={`${o.group}-${i}`}>
              <span>{o.label}</span>
              <span className="hire__paid">{o.group}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const format = (v) => (v === null || v === undefined ? '—' : String(v))

/** Rough is fine here; the exact minute has never decided which copy is real. */
function when(ts) {
  const mins = Math.round((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}
