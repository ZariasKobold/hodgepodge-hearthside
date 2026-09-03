/**
 * Who may see a stored object on this browser.
 *
 * Lifted out of `campaignShape.js` unchanged, because v3 has **two** kinds of
 * owned object rather than one and the rule must not fork. An arsenal and a
 * campaign answer this question identically, and the moment they answer it in
 * two places they will eventually answer it differently.
 *
 * Both kinds carry `ownerUserId`. That is deliberately the same field name on
 * both, even though D1 spells it `owner_user_id` on `campaigns` and `user_id`
 * on `arsenals` — the projection maps the column, the document does not have to
 * inherit the inconsistency.
 */

/**
 * May this user see this object on this browser?
 *
 * Unclaimed objects are visible to everyone, because that is the adoption
 * path: work built before signing in has to survive signing in. An object
 * already stamped with someone else's id is visible to nobody else — it stays
 * in storage rather than being deleted, because the alternative is throwing
 * away work that may not have finished syncing.
 */
export function belongsTo(obj, userId) {
  if (!obj) return false
  if (!obj.ownerUserId) return true
  return obj.ownerUserId === userId
}

/**
 * Should an open object be closed because it is not this account's?
 *
 * A function rather than a condition inline in a hook, because the condition
 * that mattered was the one that was missing. `userReady` distinguishes "nobody
 * is signed in" from "we have not asked yet": `useAuth` reports `user: null`
 * while its first request is in flight, and treating that as signed-out closed
 * the campaign the user had open and wrote the closure to storage, so it stayed
 * closed after sign-in resolved.
 */
export function shouldRelease(obj, userId, userReady) {
  if (!userReady) return false
  if (!obj) return false
  return !belongsTo(obj, userId)
}

/**
 * Claim an unclaimed object for an account.
 *
 * Returns the same object when there is nothing to do, so a caller can compare
 * by identity and skip a write. Never re-stamps an object that already carries
 * an id — that would be one account taking another's work rather than adopting
 * loose work.
 */
export function claim(obj, userId) {
  if (!obj || !userId || obj.ownerUserId) return obj
  return { ...obj, ownerUserId: userId }
}
