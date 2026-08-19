/**
 * The sign-in control, and nothing else.
 *
 * Signed out is a first-class state, never an error to recover from. The whole
 * app works against local storage with nobody signed in and that has to stay
 * true — accounts exist so a campaign can be SHARED, not so it can be used
 * (docs/data-model.md §3). Nothing here gates anything.
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
