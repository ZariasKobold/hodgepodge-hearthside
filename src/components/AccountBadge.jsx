/**
 * The sign-in control, and nothing else.
 *
 * **Play is gated behind an account** (v0.4.8, CLAUDE.md §12). This header used
 * to say the opposite — that accounts were for sharing and nothing gated
 * anything — and went on saying it for eight versions after the rule changed,
 * citing a section of data-model.md that had already been marked superseded.
 * Corrected in the v0.5.2 audit (M7).
 *
 * The gating itself lives in `SignInGate`, not here; this is still only a
 * control. But it is no longer true that the app works signed out, and a future
 * session should not read this file and conclude otherwise.
 *
 * Renders nothing at all when the backend is absent, which is every
 * `npm run dev` session, since Vite serves no Functions. A sign-in button
 * there would be a button that cannot work, and a dead control is worse than
 * no control.
 */
export default function AccountBadge({ auth }) {
  const { user, loading, available, signIn, signOut } = auth

  // Nothing during the first check either — a control that says "Sign in" and
  // then flips to a name a moment later reads as a glitch.
  if (loading || !available) return null

  if (!user) {
    return (
      <button className="account__btn" onClick={() => signIn('discord')}>
        Sign in
      </button>
    )
  }

  return (
    <span className="account">
      {/* Decorative: the name beside it already says who this is. */}
      {user.avatarUrl && <img className="account__avatar" src={user.avatarUrl} alt="" />}
      <span className="account__name">{user.displayName}</span>
      <button className="account__btn" onClick={signOut}>
        Sign out
      </button>
    </span>
  )
}
