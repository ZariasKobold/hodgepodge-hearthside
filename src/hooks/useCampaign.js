import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  saveCampaign, loadCampaign, campaignIds, removeCampaign,
  activeCampaignId, setActiveCampaignId, adoptLegacyCampaign,
  load,
} from '../lib/storage.js'
import {
  createCampaign, createModel, migrate, migrateLeaderToCampaign,
  myArsenal as selectMyArsenal, currentWeek, totalFor, mustHireThisWeek,
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
export function useCampaign({ onSaved, onRemoved } = {}) {
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
  const shelf = useMemo(
    () => ids.map((id) => (id === openId && campaign ? campaign : migrate(loadCampaign(id)))).filter(Boolean),
    [ids, openId, campaign]
  )

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
    const stamped = saveCampaign(campaign)
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
    setCampaign(found)
    setOpenId(id)
    setActiveCampaignId(id)
  }, [])

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
    const incoming = migrate(data)
    if (!incoming?.arsenals?.length) {
      throw new Error('That file does not look like a campaign — no arsenals in it.')
    }
    // `createCampaign` spreads its patch last, so passing `id: undefined`
    // overwrites the id it just minted and the save silently no-ops. Strip the
    // key instead of blanking it.
    const { id: _discarded, ...rest } = incoming
    const filed = createCampaign(rest)
    saveCampaign(filed)
    setIds(campaignIds())
    setCampaign(filed)
    setOpenId(filed.id)
    setActiveCampaignId(filed.id)
    return filed.id
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
