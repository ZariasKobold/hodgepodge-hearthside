import { Button } from './ui.jsx'

/**
 * What is still owed or unfinished on this leader, at the top of every screen.
 *
 * ## Why it is at the top rather than on the screen that fixes it
 *
 * Both of this app's one-time repairs shipped as a panel where the fix lives,
 * and both were invisible in practice. The starting-scrip offer sits on the
 * final step of the *creation* wizard; six days after it shipped, not one
 * arsenal on the database had been paid, and a player asked in Discord why she
 * was still short. **A repair nobody can find is not a repair.** So the finding
 * travels to the player instead of waiting to be walked into, and it rides
 * above the view because the player's location is exactly the thing that
 * cannot be assumed.
 *
 * ## It is not dismissible, and it is not Hank
 *
 * There is no "got it" button. An item leaves because it was *fixed* — the
 * whole list is derived on every render by `lib/outstanding.js`, so nothing
 * here can drift out of step with the truth, and a dismissal would let it. A
 * dismissed warning and a resolved one are indistinguishable a week later, and
 * only one of them is honest.
 *
 * It uses `.gap-note`, never `<HankSays>` (§5). Somebody who turned the voice
 * off still needs to be told the app is holding scrip it never paid them, and
 * one of these items is a defect report rather than a chore.
 */
export default function OutstandingBar({ items = [], others = [], onGo }) {
  if (!items.length && !others.length) return null

  return (
    <section className="outstanding" aria-label="Unfinished business">
      {items.map((item) => (
        <div
          key={item.id}
          className={`gap-note outstanding__item outstanding__item--${item.severity}`}
        >
          <strong>{item.title}</strong>{' '}
          {item.detail}
          {/* The things are named, never counted. "3 items" is not something a
              player can check against their own table; "Gatling Gun" is. */}
          {item.names?.length > 0 && (
            <span className="outstanding__names"> — {item.names.join(', ')}.</span>
          )}
          {item.where && onGo && (
            <div className="outstanding__go">
              <Button onClick={() => onGo(item.where)}>
                {item.where === 'creation' ? 'Take me to it' : 'Put this right'}
              </Button>
            </div>
          )}
          {/* Drift has nowhere to send anybody yet, and saying so is better
              than a button that goes somewhere unhelpful. What the record
              holds is the recovery route, so point at it plainly. */}
          {!item.where && (
            <div className="outstanding__go">
              <span className="note">
                Nothing is lost — the game record still holds all of it. Tell
                whoever runs the campaign before you play another week.
              </span>
            </div>
          )}
        </div>
      ))}

      {/* A player with two leaders would otherwise have to open the second one
          to be told it is owed anything, which is the same "you had to already
          be looking" failure this bar exists to end. */}
      {others.length > 0 && (
        <p className="note outstanding__others">
          {others.length === 1
            ? 'Another leader on your shelf has something outstanding too: '
            : `${others.length} other leaders on your shelf have something outstanding too: `}
          {others.map((g, i) => (
            <span key={g.arsenal.id}>
              {i > 0 && ', '}
              <strong>{g.arsenal.leader?.name || 'Unnamed leader'}</strong>
              {` (${g.items.length})`}
            </span>
          ))}
          . Open one from Leaders to see what it needs.
        </p>
      )}
    </section>
  )
}
