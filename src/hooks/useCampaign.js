import { useState, useEffect, useCallback, useMemo } from 'react'
import { save, load } from '../lib/storage.js'
import {
  createCampaign, createModel, migrate, migrateLeaderToCampaign,
  myArsenal as selectMyArsenal, currentWeek, totalFor, mustHireThisWeek,
} from '../lib/campaignShape.js'

const KEY = 'campaign:current'
const LEGACY_KEY = 'leader:current'

/**
 * Campaign state, persisted locally.
 *
 * Exposes a `leader` / `setLeader` pair that behaves like the old useLeader
 * API on purpose. The creation wizard edits one leader inside one arsenal, so
 * keeping that seam means the four step components didn't need rewriting when
 * the underlying shape changed.
 *
 * Local-first is not a stepping stone to remote — it's the fallback that has to
 * keep working. Permission from Wyrd is revocable, so a campaign must survive
 * this app disappearing.
 */
export function useCampaign() {
  const [campaign, setCampaign] = useState(() => {
    const saved = load(KEY)
    if (saved) return migrate(saved)

    // One-time lift from the v0.1 single-leader record.
    const legacy = load(LEGACY_KEY)
    if (legacy) return migrateLeaderToCampaign(legacy)

    return createCampaign()
  })

  useEffect(() => {
    save(KEY, campaign)
  }, [campaign])

  const arsenal = useMemo(() => selectMyArsenal(campaign), [campaign])
  const week = useMemo(() => currentWeek(campaign), [campaign])

  /** Applies a patch to whichever arsenal belongs to this device. */
  const updateArsenal = useCallback((patch) => {
    setCampaign((prev) => ({
      ...prev,
      arsenals: prev.arsenals.map((a) =>
        a.id === prev.localArsenalId
          ? { ...a, ...(typeof patch === 'function' ? patch(a) : patch) }
          : a
      ),
    }))
  }, [])

  const setCampaignField = useCallback((patch) => {
    setCampaign((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  }, [])

  const setHouseRules = useCallback((patch) => {
    setCampaign((prev) => ({ ...prev, houseRules: { ...prev.houseRules, ...patch } }))
  }, [])

  /* ── wizard-facing adapter ────────────────────────────────────── */

  /**
   * A flat view of the leader plus the arsenal fields the wizard edits, in the
   * shape the step components already expect.
   */
  const leader = useMemo(() => ({
    ...arsenal.leader,
    faction: arsenal.faction,
    keywords: arsenal.keywords,
    crewCard: arsenal.crewCard,
    arsenal: arsenal.models,
  }), [arsenal])

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

  const reset = useCallback(() => setCampaign(createCampaign()), [])

  return {
    campaign, setCampaignField, setHouseRules, reset,
    arsenal, updateArsenal,
    week,
    totalCost: totalFor(arsenal),
    mustHire: mustHireThisWeek(arsenal, week),
    // wizard adapter — same surface the old useLeader exposed
    leader, set: setLeader, setPick,
    addModel, removeModel, spendScrip, earnScrip,
  }
}
