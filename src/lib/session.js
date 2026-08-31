/**
 * Who the app believes is signed in, including when it cannot ask.
 *
 * Until v0.15.0 an unreachable backend meant an unusable app: `useAuth`
 * reported `available: false`, `SignInGate` closed the wizard, and a player on
 * a train with twelve weeks in localStorage was shown "Sign-in is unreachable"
 * and nothing else. CLAUDE.md §12b named that as the accepted cost of gating
 * play behind an account. Making the app installable is what made it
 * unacceptable — an app you can put on a home screen and then cannot open
 * without a signal is a worse promise than a bookmark.
 *
 * So a successful sign-in is remembered on the device, and an unreachable
 * backend falls back to it. The gate still stands for anyone this browser has
 * never seen signed in.
 *
 * ## What this does and does not trust
 *
 * The remembered session decides two things only: whether the wizard opens,
 * and which local campaigns are visible (`belongsTo`). It grants nothing on
 * the server — every D1 read and write still needs the real cookie, and
 * `functions/lib/campaignStore.js` still takes the owner from the session
 * rather than from anything the client says. Forging this file would show you
 * campaigns that are already sitting unencrypted in the same browser's
 * localStorage, which is not a boundary worth defending.
 *
 * It is cleared on sign-out and on account deletion, so "sign out" still means
 * the next person sees nothing.
 */
import { load, save, remove } from './storage.js'

const KEY = 'session:user'

/**
 * The decision itself, kept pure so it can be asserted rather than described.
 *
 * `reachable` is whether /api/auth/me answered at all — not whether it said
 * yes. Those are different: an answer of "nobody is signed in" is authoritative
 * and clears the remembered session, while no answer at all is what the
 * fallback exists for.
 */
export function decideSession({ reachable, serverUser = null, remembered = null }) {
  if (reachable) {
    return { user: serverUser, available: true, offline: false }
  }
  return { user: remembered, available: false, offline: Boolean(remembered) }
}

/** Only the three fields the app shows. No tokens — there are none to store. */
export function rememberUser(user) {
  if (!user?.id) return
  save(KEY, { id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl })
}

export function rememberedUser() {
  const stored = load(KEY, null)
  return stored?.id ? stored : null
}

export function forgetUser() {
  remove(KEY)
}
