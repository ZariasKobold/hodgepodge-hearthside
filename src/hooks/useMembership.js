import { useState, useCallback, useEffect, useRef } from 'react'
import * as api from '../lib/membership.js'

/**
 * Membership for one campaign, plus the invite in the address bar.
 *
 * Nothing is cached to localStorage, deliberately. Everything else in this app
 * is local-first because a campaign has to survive being offline; membership is
 * the opposite case — it is the answer to "who may see my data", and a stale
 * copy of that answer is worse than no answer. Offline, this section says so
 * and the rest of the app carries on.
 */
export function useMembership({ campaignId, signedIn }) {
  const [members, setMembers] = useState([])
  const [arsenals, setArsenals] = useState([])
  const [invites, setInvites] = useState([])
  const [viewerRole, setViewerRole] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  /** The token shown once, after issuing. Never stored; never re-fetchable. */
  const [freshInvite, setFreshInvite] = useState(null)

  const abortRef = useRef(null)

  const refresh = useCallback(async () => {
    if (!campaignId || !signedIn) {
      setMembers([]); setArsenals([]); setInvites([]); setViewerRole(null)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    try {
      const memberList = await api.members(campaignId, { signal: controller.signal })
      setMembers(memberList.members || [])
      setViewerRole(memberList.viewerRole || null)

      const shared = await api.sharedArsenals(campaignId, { signal: controller.signal })
      setArsenals(shared.arsenals || [])

      // Only the host can see invites, and asking as anyone else is a 404 —
      // which is correct but not an error worth showing, so it is swallowed.
      if (memberList.viewerRole === 'owner') {
        const list = await api.invites(campaignId, { signal: controller.signal }).catch(() => null)
        setInvites(list?.invites || [])
      } else {
        setInvites([])
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      // A 404 here means "this campaign has no shared side yet", which is the
      // ordinary state of every solo campaign — not something to alarm anyone.
      setError(err.notFound ? null : err.message)
      setMembers([]); setArsenals([]); setInvites([]); setViewerRole(null)
    } finally {
      setLoading(false)
    }
  }, [campaignId, signedIn])

  useEffect(() => { refresh() }, [refresh])

  const act = useCallback(async (fn) => {
    setError(null)
    try {
      const result = await fn()
      await refresh()
      return result
    } catch (err) {
      setError(err.message)
      return null
    }
  }, [refresh])

  return {
    members, arsenals, invites, viewerRole, loading, error, freshInvite,
    isHost: viewerRole === 'owner',
    isMember: viewerRole === 'owner' || viewerRole === 'active',
    refresh,
    issueInvite: (note) => act(async () => {
      const { invite } = await api.issueInvite(campaignId, { note })
      // Held in memory only, and shown once — the server keeps a hash, so
      // there is no second chance to read this and that is the point.
      setFreshInvite(invite)
      return invite
    }),
    dismissInvite: () => setFreshInvite(null),
    revokeInvite: (id) => act(() => api.revokeInvite(id)),
    admit: (userId) => act(() => api.admit(campaignId, userId)),
    remove: (userId) => act(() => api.remove(campaignId, userId)),
    saveProfile: (patch) => act(() => api.saveProfile(campaignId, patch)),
    link: (mine) => act(() => api.link(campaignId, mine)),
  }
}

/**
 * The invite in the address bar, redeemed once and then cleared out of it.
 *
 * Lives apart from `useMembership` because it belongs to no campaign — it is
 * how you reach one you are not yet in. Runs once per load, and only while
 * signed in: redeeming binds the invite to an account, so doing it for nobody
 * would burn a single-use token on a person who cannot be admitted.
 */
export function useInviteRedemption({ signedIn, onJoined }) {
  const [state, setState] = useState(() =>
    api.inviteFromUrl() ? { status: 'waiting' } : { status: 'none' }
  )
  const done = useRef(false)

  useEffect(() => {
    if (done.current) return
    const token = api.inviteFromUrl()
    if (!token) return
    if (!signedIn) {
      // Kept in the URL on purpose: signing in reloads the page, and the token
      // has to survive that round trip to be redeemed on the way back.
      setState({ status: 'needs-sign-in' })
      return
    }

    done.current = true
    setState({ status: 'redeeming' })
    api.redeem(token)
      .then((result) => {
        api.clearInviteFromUrl()
        if (result.ok) {
          setState({ status: 'pending', campaignId: result.campaignId })
          onJoined?.(result.campaignId)
        } else {
          setState({
            status: 'refused',
            reason: result.reason,
            message: api.REDEEM_REASONS[result.reason] || 'That invite could not be used.',
          })
        }
      })
      .catch((err) => {
        // Left in the URL: this failed for a reason that may not recur, and
        // the token is still unspent, so a reload is a fair thing to try.
        setState({ status: 'error', message: err.message })
      })
  }, [signedIn, onJoined])

  return { ...state, dismiss: () => { api.clearInviteFromUrl(); setState({ status: 'none' }) } }
}
