import { describe, it, expect } from 'vitest'
import { decideSession } from './session.js'

const alice = { id: 'u-alice', displayName: 'Alice', avatarUrl: null }

describe('decideSession', () => {
  it('takes the server at its word when it answers', () => {
    expect(decideSession({ reachable: true, serverUser: alice, remembered: null }))
      .toEqual({ user: alice, available: true, offline: false })
  })

  /**
   * The distinction the whole thing turns on. "Nobody is signed in" is an
   * answer; "no answer" is not. Treating them alike would either lock a
   * signed-in player out on a train, or keep admitting someone who has signed
   * out.
   */
  it('signs the user out when the server says nobody is signed in, even with a session remembered', () => {
    expect(decideSession({ reachable: true, serverUser: null, remembered: alice }))
      .toEqual({ user: null, available: true, offline: false })
  })

  it('falls back to the remembered session when the backend cannot be reached', () => {
    expect(decideSession({ reachable: false, remembered: alice }))
      .toEqual({ user: alice, available: false, offline: true })
  })

  it('still gates a browser that has never seen anyone sign in', () => {
    expect(decideSession({ reachable: false, remembered: null }))
      .toEqual({ user: null, available: false, offline: false })
  })

  it('never reports available while unreachable, so sync stays off', () => {
    // `available` is what stops useSync trying to push into the void, and what
    // makes the shelf say where the data actually is.
    expect(decideSession({ reachable: false, remembered: alice }).available).toBe(false)
  })

  it('marks the session offline only when it is standing in for a real one', () => {
    expect(decideSession({ reachable: false, remembered: null }).offline).toBe(false)
    expect(decideSession({ reachable: true, serverUser: alice }).offline).toBe(false)
  })
})
