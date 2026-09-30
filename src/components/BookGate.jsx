import { useEffect, useState } from 'react'
import { Label, Button, Input } from './ui.jsx'
import { BOOK_TITLES, fetchChallenge, submitAnswer, resetBookCache } from '../lib/book.js'

/**
 * Proving you own the book, once.
 *
 * Wyrd has no purchase API — no OAuth, no entitlement endpoint — so ownership
 * cannot be verified, only demonstrated. This asks something answerable only by
 * somebody holding the book, and the server decides. See
 * `functions/lib/bookStore.js`.
 *
 * ## Asked once, and only when there is something to unlock
 *
 * The server returns `null` for a title already proved, so this renders nothing
 * from then on — no dismissal to remember and no state on the client that could
 * disagree with the account. It also returns `null` when no question has been
 * written for a title, so a deployment with no challenges loaded shows no gate
 * rather than an unanswerable one.
 *
 * ## It is an offer, never a wall
 *
 * Nothing in the app is gated on answering: the record, the roster, the
 * aftermath and every number all work exactly as before. The only thing behind
 * this is the book's own prose, which is Wyrd's to give. A player who never
 * answers loses nothing they had, which is why this sits inline and quiet
 * rather than blocking a screen.
 */
export default function BookGate() {
  const [challenge, setChallenge] = useState(null)
  const [answer, setAnswer] = useState('')
  const [state, setState] = useState({ status: 'idle' })

  useEffect(() => {
    let live = true
    ;(async () => {
      for (const title of BOOK_TITLES) {
        const found = await fetchChallenge(title)
        // A lockout comes back without a question; there is nothing to show and
        // nothing useful to say beyond waiting, so stay quiet.
        if (found?.id && live) { setChallenge(found); return }
      }
    })()
    return () => { live = false }
  }, [])

  if (!challenge) return null

  const send = async () => {
    setState({ status: 'sending' })
    const result = await submitAnswer(challenge.id, answer)
    if (result?.ok) {
      /**
       * Reload, rather than just hiding the gate.
       *
       * Every key already asked about this session was answered under the old
       * permissions and is in the cache as "no text" — and `useBookText` keys
       * its effect on the *keys*, which have not changed, so clearing the cache
       * alone leaves every record on screen still blank with no way to refresh
       * it. That would read as the unlock having failed.
       *
       * A reload is heavy, and it is fine here: this happens once per account
       * for the life of the app, and everything in the campaign autosaves.
       */
      resetBookCache()
      setChallenge(null)
      window.location.reload()
      return
    }
    setState({
      status: 'wrong',
      remaining: result?.remaining ?? null,
      lockedUntil: result?.lockedUntil ?? null,
    })
  }

  return (
    <section className="gap-note book-gate">
      <Label>Do you own {challenge.title === 'the-silent-catalogue'
        ? 'The Silent Catalogue'
        : 'Index of the Untold'}?</Label>

      <p>
        <strong>{challenge.question}</strong>
      </p>
      <p className="note">
        Rules text is Wyrd's to publish, so this app shows it only to players who
        own the book. Answer once and it stays unlocked — for the entries your
        leader has actually earned. Everything else in the app works either way.
      </p>

      <div className="book-gate__row">
        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && answer.trim()) send() }}
          placeholder="Your answer"
          aria-label="Your answer"
        />
        <Button onClick={send} disabled={!answer.trim() || state.status === 'sending'}>
          {state.status === 'sending' ? 'Checking…' : 'Unlock'}
        </Button>
      </div>

      {state.status === 'wrong' && (
        <p className="note note--warn">
          {state.lockedUntil
            ? 'Too many tries. Come back in a little while.'
            : `That is not what the book says.${
              state.remaining != null ? ` ${state.remaining} tries left.` : ''
            }`}
        </p>
      )}
    </section>
  )
}
