import { useState, useCallback, useEffect, useRef } from 'react'
import * as api from '../lib/membership.js'

/**
 * Membership for one table, plus the invite in the address bar.
 *
 * Nothing is cached to localStorage, deliberately. Everything else in this app
 * is local-first because a campaign has to survive being offline; membership is
 * the opposite case — it is the answer to "who may see my data", and a stale
 * copy of that answer is worse than no answer. Offline, this section says so
 * and the rest of the app carries on.
 *
 * ## Which table
 *
 * `campaignId` is the open arsenal's own campaign. For a host that is the
 * table. For somebody who joined another player's campaign it is not — their
 * arsenal sits in a campaign of their own, *linked* to the host's — and this
 * hook used to ask only about the open one, so every member was shown as the
 * host of an empty table and never saw the campaign they had joined. Now the
 * account's memberships are read first and `tableId` is whichever table this
 * campaign actually plays at (`resolveTable`), switchable by `viewTable`.
 */
export function useMembership({ campaignId, signedIn, userId = null }) {
  const [memberships, setMemberships] = useState([])
  const [membershipsReady, setMembershipsReady] = useState(false)
  const [chosen, setChosen] = useState(null)

  const [members, setMembers] = useState([])
  const [host, setHost] = useState(null)
  const [arsenals, setArsenals] = useState([])
  const [invites, setInvites] = useState([])
  const [viewerRole, setViewerRole] = useState(null)
  /**
   * Has the account ever seen this campaign?
   *
   * `null` until asked. `false` means the server returned a 404 — there is no
   * such campaign row, which is the ordinary state of anything created on this
   * device and not yet synced. That is a different fact from "nobody has been
   * invited", and telling a player the second when the first is true reads as
   * their invite having failed.
   */
  const [knownToServer, setKnownToServer] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  /** The token shown once, after issuing. Never stored; never re-fetchable. */
  const [freshInvite, setFreshInvite] = useState(null)

  const abortRef = useRef(null)

  // A different leader opened is a different question; forget the old answer.
  useEffect(() => { setChosen(null) }, [campaignId])

  const tableId = api.resolveTable({ campaignId, memberships, chosen })
  const joined = memberships.filter((m) => !m.isOwner)
  const table = joined.find((m) => m.campaignId === tableId) || null

  const refreshMemberships = useCallback(async () => {
    if (!signedIn) {
      setMemberships([]); setMembershipsReady(false)
      return
    }
    try {
      const { memberships: list } = await api.memberships()
      setMemberships(list || [])
    } catch {
      // Unreachable means "show the open campaign", which is what this did
      // before memberships were read at all. The table read reports the error.
      setMemberships([])
    } finally {
      setMembershipsReady(true)
    }
  }, [signedIn])

  useEffect(() => { refreshMemberships() }, [refreshMemberships])

  const pendingHere = table?.status === 'pending'

  const refreshTable = useCallback(async () => {
    if (!tableId || !signedIn || !membershipsReady) {
      setMembers([]); setHost(null); setArsenals([]); setInvites([]); setViewerRole(null)
      setKnownToServer(null)
      return
    }
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Waiting on the host: the server will refuse every read, correctly, and
    // there is nothing to fetch. Gate two is the host's, not ours to probe.
    if (pendingHere) {
      setMembers([]); setHost(null); setArsenals([]); setInvites([])
      setViewerRole('pending'); setKnownToServer(true); setError(null)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const memberList = await api.members(tableId, { signal: controller.signal })
      setMembers(memberList.members || [])
      setHost(memberList.host || null)
      setViewerRole(memberList.viewerRole || null)
      setKnownToServer(true)

      const shared = await api.sharedArsenals(tableId, { signal: controller.signal })
      setArsenals(shared.arsenals || [])

      // Only the host can see invites, and asking as anyone else is a 404 —
      // which is correct but not an error worth showing, so it is swallowed.
      if (memberList.viewerRole === 'owner') {
        const list = await api.invites(tableId, { signal: controller.signal }).catch(() => null)
        setInvites(list?.invites || [])
      } else {
        setInvites([])
      }
    } catch (err) {
      if (err.name === 'AbortError') return
      // A 404 here means "this campaign has no shared side yet", which is the
      // ordinary state of every solo campaign — not something to alarm anyone.
      setError(err.notFound ? null : err.message)
      setKnownToServer(err.notFound ? false : null)
      setMembers([]); setHost(null); setArsenals([]); setInvites([]); setViewerRole(null)
    } finally {
      setLoading(false)
    }
  }, [tableId, signedIn, membershipsReady, pendingHere])

  useEffect(() => { refreshTable() }, [refreshTable])

  const refresh = useCallback(async () => {
    await refreshMemberships()
    await refreshTable()
  }, [refreshMemberships, refreshTable])

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

  const isHost = viewerRole === 'owner'
  // Somebody still waiting cannot read the member list, so their own nickname
  // comes off their membership instead — it is their own row either way.
  const me = isHost
    ? host
    : members.find((m) => m.isYou)
      || (table ? { isYou: true, nickname: table.nickname, sharesIdentity: table.sharesIdentity } : null)

  return {
    members, host, me, arsenals, invites, viewerRole, loading, error, freshInvite, knownToServer,
    memberships, joined, table, tableId,
    ownCampaignId: campaignId,
    isHost,
    isMember: viewerRole === 'owner' || viewerRole === 'active',
    isPending: viewerRole === 'pending',
    refresh,
    /** Look at a different table: your own, or one you have joined. */
    viewTable: (id) => { setChosen(id || null) },
    /** After redeeming: re-read the account, then show the table just joined. */
    joinedTable: async (id) => { await refreshMemberships(); if (id) setChosen(id) },
    issueInvite: (note) => act(async () => {
      const { invite } = await api.issueInvite(tableId, { note })
      // Held in memory only, and shown once — the server keeps a hash, so
      // there is no second chance to read this and that is the point.
      setFreshInvite(invite)
      return invite
    }),
    dismissInvite: () => setFreshInvite(null),
    revokeInvite: (id) => act(() => api.revokeInvite(id)),
    admit: (memberUserId) => act(() => api.admit(tableId, memberUserId)),
    remove: (memberUserId) => act(() => api.remove(tableId, memberUserId)),
    /** Leave the table being viewed. Your own id, never one from the page. */
    leave: () => userId && act(async () => {
      await api.remove(tableId, userId)
      setChosen(campaignId)
    }),
    saveProfile: (patch) => act(() => api.saveProfile(tableId, patch)),
    /** Sit one of your own campaigns — and so its arsenal — at this table. */
    link: (mine) => act(() => api.link(tableId, mine)),
    withdraw: () => act(() => api.unlink(tableId)),
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
