import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  saveCampaign, loadCampaign, campaignIds, removeCampaign,
  activeCampaignId, setActiveCampaignId, adoptLegacyCampaign,
  load,
} from '../lib/storage.js'
import {
  createCampaign, createModel, migrate, migrateLeaderToCampaign,
  myArsenal as selectMyArsenal, currentWeek, totalFor, mustHireThisWeek,
  belongsTo, shouldRelease,
} from '../lib/campaignShape.js'

const LEGACY_LEADER_KEY = 'leader:current'

/**
 * A shelf of campaigns, one of which may be open.
 *
 * Each campaign holds one leader and that leader's arsenal, so switching
 * leaders means opening a different campaign rather than editing a list inside
 * one. The `arsenals` array inside a campaign is for *other players* — max
 * encounter size compares both arsenals — so a second leader of your own could
 * never have lived there.
 *
 * `campaign` is null when nothing is open, and every derived value degrades to
 * a safe empty rather than throwing. App renders the shelf in that state; the
 * wizard steps are only mounted once something is open.
 *
 * Local-first is not a stepping stone to remote — it's the fallback that has to
 * keep working. Permission from Wyrd is revocable, so a campaign must survive
 * this app disappearing.
 */
export function useCampaign({ userId = null, userReady = true, onSaved, onRemoved } = {}) {
  const [ids, setIds] = useState(() => {
    // One-time lifts, oldest first: the v0.1 single leader, then the
    // single-campaign key everything before the shelf wrote to.
    const legacyLeader = load(LEGACY_LEADER_KEY)
    if (campaignIds().length === 0 && legacyLeader && !load('campaign:current')) {
      const lifted = migrateLeaderToCampaign(legacyLeader)
      if (lifted) {
        saveCampaign(lifted)
        setActiveCampaignId(lifted.id)
      }
    }
    adoptLegacyCampaign()
    return campaignIds()
  })

  const [openId, setOpenId] = useState(() => {
    const active = activeCampaignId()
    return active && campaignIds().includes(active) ? active : null
  })

  const [campaign, setCampaign] = useState(() => {
    const active = activeCampaignId()
    return active ? migrate(loadCampaign(active)) : null
  })

  // Every campaign on the shelf, for rendering it. Re-read whenever the shelf
  // or the open campaign changes, so a rename shows immediately.
  /**
   * Scoped to the account — but only once there is an answer about who that is.
   *
   * `useAuth` reports `user: null` while its first /api/auth/me is in flight,
   * and "nobody is signed in" and "we have not asked yet" are different
   * answers. Treating the first as the second hid every claimed campaign for
   * the length of that request.
   */
  const shelf = useMemo(
    () => ids
      .map((id) => (id === openId && campaign ? campaign : migrate(loadCampaign(id))))
      .filter(Boolean)
      .filter((c) => (userReady ? belongsTo(c, userId) : true)),
    [ids, openId, campaign, userId, userReady]
  )

  /**
   * A campaign belonging to another account must not stay open across a
   * sign-in. Closing rather than deleting: their work is still theirs and is
   * still on the disk, it simply is not this account's to look at.
   *
   * **Waits for auth to settle.** Without the guard this ran during the first
   * /api/auth/me, when `userId` is null because the answer has not arrived —
   * so a campaign claimed by the signed-in user looked foreign, was closed, and
   * `setActiveCampaignId(null)` wrote that closure to storage. The campaign
   * then stayed shut after sign-in resolved, and the masthead lost every tab
   * except Leaders. Transient state that persists itself is the dangerous
   * kind.
   */
  useEffect(() => {
    if (!shouldRelease(campaign, userId, userReady)) return
    setCampaign(null)
    setOpenId(null)
    setActiveCampaignId(null)
  }, [campaign, userId, userReady])

  // Skip the write on the render that merely opened a campaign — it would be
  // writing back exactly what it just read.
  const lastWritten = useRef(null)
  useEffect(() => {
    if (!campaign) return
    if (lastWritten.current === campaign) return
    lastWritten.current = campaign
    // Local first and synchronously; the mirror upward is best-effort and
    // never gates the write. `saveCampaign` returns the stamped copy, which is
    // what must go to the server — the unstamped one would lose every merge.
    // Claim it on first save while signed in. Only ever set on an unclaimed
    // campaign — re-stamping one that already carries an id would be one
    // account taking another's work rather than adopting loose work.
    const claimed = userId && !campaign.ownerUserId ? { ...campaign, ownerUserId: userId } : campaign
    const stamped = saveCampaign(claimed)
    if (stamped) onSaved?.(stamped)
  }, [campaign, onSaved])

  /** Re-reads the shelf from storage, after a sync pulled rows down. */
  const refresh = useCallback(() => {
    setIds(campaignIds())
    setCampaign((prev) => (prev ? migrate(loadCampaign(prev.id)) || prev : prev))
  }, [])

  /* ── the shelf ────────────────────────────────────────────────── */

  const open = useCallback((id) => {
    const found = migrate(loadCampaign(id))
    if (!found) return
    if (!belongsTo(found, userId)) return
    setCampaign(found)
    setOpenId(id)
    setActiveCampaignId(id)
  }, [userId])

  const close = useCallback(() => {
    setCampaign(null)
    setOpenId(null)
    setActiveCampaignId(null)
  }, [])

  const startNew = useCallback(() => {
    const fresh = createCampaign()
    saveCampaign(fresh)
    setIds(campaignIds())
    setCampaign(fresh)
    setOpenId(fresh.id)
    setActiveCampaignId(fresh.id)
    return fresh.id
  }, [])

  const discard = useCallback((id) => {
    removeCampaign(id)
    onRemoved?.(id)
    setIds(campaignIds())
    setOpenId((prev) => (prev === id ? null : prev))
    setCampaign((prev) => (prev?.id === id ? null : prev))
  }, [onRemoved])

  /**
   * Files an imported campaign as a new entry rather than replacing anything.
   *
   * A fresh id is minted even when the file carries one, so importing the same
   * export twice gives two campaigns instead of silently overwriting the first.
   * Nothing already on the shelf can be lost by importing.
   */
  const adopt = useCallback((data) => {
    /**
     * One campaign, or a bundle of them.
     *
     * The bundle shape exists because the sign-in gate's rescue has to be able
     * to export a whole shelf — and an export this app cannot read back is not
     * a rescue (audit v0.11.0, H2/H3). Accepting a bare campaign keeps every
     * file exported before this change importable.
     */
    const list = Array.isArray(data)
      ? data
      : Array.isArray(data?.campaigns) ? data.campaigns : [data]

    const filed = []
    for (const one of list) {
      const incoming = migrate(one)
      if (!incoming?.arsenals?.length) continue
      // `createCampaign` spreads its patch last, so passing `id: undefined`
      // overwrites the id it just minted and the save silently no-ops. Strip
      // the key instead of blanking it. The owner is stripped too: an imported
      // file is this account's now, whoever exported it.
      const { id: _discarded, ownerUserId: _wasTheirs, ...rest } = incoming
      const one2 = createCampaign(rest)
      saveCampaign(one2)
      filed.push(one2)
    }

    if (filed.length === 0) {
      throw new Error('That file does not look like a campaign — no arsenals in it.')
    }

    setIds(campaignIds())
    setCampaign(filed[0])
    setOpenId(filed[0].id)
    setActiveCampaignId(filed[0].id)
    return filed[0].id
  }, [])

  /* ── the open campaign ────────────────────────────────────────── */

  const arsenal = useMemo(() => (campaign ? selectMyArsenal(campaign) : null), [campaign])
  const week = useMemo(() => (campaign ? currentWeek(campaign) : 1), [campaign])

  const updateArsenal = useCallback((patch) => {
    setCampaign((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        arsenals: prev.arsenals.map((a) =>
          a.id === prev.localArsenalId
            ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) }
            : a
        ),
      }
    })
  }, [])

  const setCampaignField = useCallback((patch) => {
    setCampaign((prev) => (prev ? { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) } : prev))
  }, [])

  const setHouseRules = useCallback((patch) => {
    setCampaign((prev) => (prev ? { ...prev, houseRules: { ...prev.houseRules, ...patch } } : prev))
  }, [])

  /* ── wizard-facing adapter ────────────────────────────────────── */

  /**
   * A flat view of the leader plus the arsenal fields the wizard edits, in the
   * shape the step components already expect.
   */
  const leader = useMemo(() => {
    if (!arsenal) return null
    return {
      ...arsenal.leader,
      faction: arsenal.faction,
      keywords: arsenal.keywords,
      crewCard: arsenal.crewCard,
      arsenal: arsenal.models,
    }
  }, [arsenal])

  const ARSENAL_FIELDS = new Set(['faction', 'keywords', 'crewCard'])

  const setLeader = useCallback((patch) => {
    const next = typeof patch === 'function' ? patch(leader) : patch

    const arsenalPatch = {}
    const leaderPatch = {}
    for (const [k, v] of Object.entries(next)) {
      if (ARSENAL_FIELDS.has(k)) arsenalPatch[k] = v
      else if (k === 'arsenal') arsenalPatch.models = v
      else leaderPatch[k] = v
    }

    updateArsenal((a) => ({
      ...arsenalPatch,
      leader: Object.keys(leaderPatch).length ? { ...a.leader, ...leaderPatch } : a.leader,
    }))
  }, [leader, updateArsenal])

  const setPick = useCallback((slot, entries) => {
    updateArsenal((a) => ({
      leader: { ...a.leader, picks: { ...a.leader.picks, [slot]: entries } },
    }))
  }, [updateArsenal])

  /* ── arsenal actions ──────────────────────────────────────────── */

  const addModel = useCallback((model, { scripPaid = 0 } = {}) => {
    updateArsenal((a) => ({
      models: [...a.models, createModel({ ...model, addedWeek: week, scripPaid })],
    }))
  }, [updateArsenal, week])

  const removeModel = useCallback((modelId) => {
    updateArsenal((a) => ({ models: a.models.filter((m) => m.id !== modelId) }))
  }, [updateArsenal])

  const spendScrip = useCallback((amount) => {
    updateArsenal((a) => ({ scrip: Math.max(0, a.scrip - amount) }))
  }, [updateArsenal])

  const earnScrip = useCallback((amount) => {
    updateArsenal((a) => ({ scrip: a.scrip + amount }))
  }, [updateArsenal])

  return {
    // the shelf
    shelf, openId, open, close, startNew, discard, adopt, refresh,
    // the open campaign
    campaign, setCampaignField, setHouseRules,
    arsenal, updateArsenal,
    week,
    totalCost: arsenal ? totalFor(arsenal) : 0,
    mustHire: arsenal ? mustHireThisWeek(arsenal, week) : false,
    // wizard adapter — same surface the step components already expect
    leader, set: setLeader, setPick,
    addModel, removeModel, spendScrip, earnScrip,
  }
}
