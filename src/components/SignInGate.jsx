import { load, exportJSON } from '../lib/storage.js'
import { Button } from './ui.jsx'

/**
 * The sign-in wall.
 *
 * Play is gated behind an account by decision (v0.4.8) so that every campaign
 * is owned by a user in the database. This reverses the older rule that the
 * app must be fully usable signed out — see CLAUDE.md §12, rewritten to match.
 *
 * The cost of that decision is concentrated here: when the backend cannot be
 * reached, nobody can get in. So this screen has one job beyond offering the
 * button — it must never leave someone stranded with work they cannot reach.
 * Anything already saved locally can still be exported to JSON from here, which
 * keeps the portability promise (CLAUDE.md §8) intact even while the wizard is
 * closed.
 */
export default function SignInGate({ auth }) {
  // Whatever the browser already holds. Someone who built a leader before the
  // gate existed must not be locked away from it.
  const local = load('campaign:current') ?? load('leader:current')

  const rescue = local && (
    <p className="gate__rescue">
      This browser still holds an unsaved campaign.{' '}
      <button
        className="gate__link"
        onClick={() => exportJSON(local, 'hodgepodge-campaign.json')}
      >
        Export it to JSON
      </button>{' '}
      — once you're signed in, <strong>Import from JSON</strong> on the leaders
      screen files it back.
    </p>
  )

  if (auth.loading) {
    return <div className="gate gate--quiet">Checking the ledger…</div>
  }

  // No Functions and no database: `npm run dev`, or an outage. There is no
  // signing in from here, so say so plainly rather than offering a dead button.
  if (!auth.available) {
    return (
      <div className="gate">
        <h2 className="gate__title">Sign-in is unreachable</h2>
        <p className="gate__body">
          The service that handles accounts isn't answering, and an account is
          required to build a leader. This is usually temporary — try again in a
          few minutes.
        </p>
        <p className="gate__body gate__body--aside">
          Running locally? <code>npm run dev</code> serves no Functions and no
          database. Use <code>npx wrangler pages dev dist</code>, or set{' '}
          <code>VITE_ALLOW_UNAUTHENTICATED=true</code> in <code>.env</code> to
          work on the wizard without an account.
        </p>
        {rescue}
      </div>
    )
  }

  return (
    <div className="gate">
      <h2 className="gate__title">Sign in to begin</h2>
      <p className="gate__body">
        A campaign runs twelve weeks and belongs to whoever built it, so it's
        filed against an account rather than this browser. Signing in means it
        follows you to another device and survives clearing your history — and
        anything you have already built here is added to your account the first
        time you sign in.
      </p>
      <p className="gate__body gate__body--aside">
        Discord only, and only your username and avatar are read. No email, no
        password — there is no column in the database for either.
      </p>
      <div className="gate__action">
        <Button onClick={() => auth.signIn('discord')}>Sign in with Discord</Button>
      </div>
      {rescue}
    </div>
  )
}
