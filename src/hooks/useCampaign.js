import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  saveCampaign, loadCampaign, campaignIds, removeCampaign,
  activeCampaignId, setActiveCampaignId, adoptLegacyCampaign,
  load, forgetVersion,
} from '../lib/storage.js'
import {
  createCampaign, createModel, createGame, createEquipment, createInjury,
  createTotem, migrate, migrateLeaderToCampaign,
  myArsenal as selectMyArsenal, currentWeek, totalFor, mustHireThisWeek,
  belongsTo, shouldRelease,
  setWeekPatch, stepWeekPatch, weekModePatch, canRegress,
  MIN_WEEKS_TOTAL, MAX_WEEKS_TOTAL,
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
    // Or a later re-import of the same id would look like a copy this device
    // had already seen, and be allowed to overwrite the server's.
    forgetVersion(id)
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

  /* ── the week ─────────────────────────────────────────────────── */

  /**
   * Move the campaign to a week the calendar disagrees with.
   *
   * Writes an offset, never a week (see `offsetForWeek`), so the campaign goes
   * on advancing by itself afterwards. Groups who play three weeks on one
   * bank holiday, or skip a fortnight, need this constantly — the alternative
   * is the app being confidently wrong about the one number every other number
   * hangs off, since the week decides the hire discount and files each model
   * under when it arrived.
   */
  const setWeek = useCallback((target) => {
    setCampaign((prev) => (prev ? { ...prev, ...setWeekPatch(prev, target) } : prev))
  }, [])

  /** Forward or back a week. Regressing is as real a need as advancing. */
  const stepWeek = useCallback((delta) => {
    setCampaign((prev) => {
      if (!prev) return prev
      if (delta < 0 && !canRegress(prev)) return prev
      return { ...prev, ...stepWeekPatch(prev, delta) }
    })
  }, [])

  /**
   * Calendar or manual, switched without the number on screen moving.
   * `weekModePatch` carries the current week across, so the switch reads as a
   * change of mechanism rather than as the campaign jumping.
   */
  const setWeekMode = useCallback((mode) => {
    setCampaign((prev) => (prev ? { ...prev, ...weekModePatch(prev, mode) } : prev))
  }, [])

  /** Back to whatever the calendar says, discarding every past correction. */
  const resetWeek = useCallback(() => {
    setCampaign((prev) => (prev ? { ...prev, weekOffset: 0 } : prev))
  }, [])

  /**
   * When the campaign actually began.
   *
   * Editable because the app is usually opened *after* the first game — the
   * campaign started at the table, not when someone got round to typing it in,
   * and in calendar mode every week since is measured from this.
   */
  const setStartedAt = useCallback((timestamp) => {
    setCampaign((prev) => (prev ? { ...prev, startedAt: timestamp } : prev))
  }, [])

  const setWeeksTotal = useCallback((n) => {
    setCampaign((prev) => {
      if (!prev) return prev
      const total = Math.min(MAX_WEEKS_TOTAL, Math.max(MIN_WEEKS_TOTAL, Math.round(Number(n) || 1)))
      return { ...prev, weeksTotal: total }
    })
  }, [])

  /* ── games and the aftermath ──────────────────────────────────── */

  /**
   * File a game against this arsenal and return it.
   *
   * Games are appended, never edited in place by anything but `updateGame`,
   * because the aftermath is walked over several sittings — a player logs the
   * result at the table and finishes the injury flips afterwards.
   */
  const logGame = useCallback((patch = {}) => {
    const game = createGame({ arsenalId: campaign?.localArsenalId ?? null, week, ...patch })
    setCampaign((prev) => (prev ? { ...prev, games: [...prev.games, game] } : prev))
    return game
  }, [campaign?.localArsenalId, week])

  const updateGame = useCallback((gameId, patch) => {
    setCampaign((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        games: prev.games.map((g) =>
          g.id === gameId ? { ...g, ...(typeof patch === 'function' ? patch(g) : patch) } : g
        ),
      }
    })
  }, [])

  const removeGame = useCallback((gameId) => {
    setCampaign((prev) => (prev ? { ...prev, games: prev.games.filter((g) => g.id !== gameId) } : prev))
  }, [])

  /* ── equipment ────────────────────────────────────────────────── */

  const buyEquipment = useCallback((entry, cost) => {
    updateArsenal((a) => ({
      equipment: [...a.equipment, createEquipment({ ...entry, acquiredWeek: week })],
      scrip: Math.max(0, a.scrip - cost),
    }))
  }, [updateArsenal, week])

  /**
   * Equipment leaves the arsenal outright when annihilated — it "may not be
   * used until purchased again" — so this deletes rather than flagging. An
   * equipment row that lingered would keep counting toward a campaign rating.
   */
  const removeEquipment = useCallback((id) => {
    updateArsenal((a) => ({ equipment: a.equipment.filter((e) => e.id !== id) }))
  }, [updateArsenal])

  /* ── injuries ─────────────────────────────────────────────────── */

  const addInjury = useCallback((entry) => {
    updateArsenal((a) => ({ injuries: [...a.injuries, createInjury({ ...entry, gainedWeek: week })] }))
  }, [updateArsenal, week])

  /**
   * Healed rather than deleted. The doctor's ledger is part of the story, and
   * an injury that was paid to remove still happened — `injuriesFor` already
   * filters on `removedAt`, so nothing downstream counts it.
   */
  const healInjury = useCallback((injuryId) => {
    updateArsenal((a) => ({
      injuries: a.injuries.map((i) => (i.id === injuryId ? { ...i, removedAt: Date.now() } : i)),
    }))
  }, [updateArsenal])

  /**
   * Deleted, not healed — for an injury that was never gained.
   *
   * The one case is Fate intervening: when miraculous recovery cancels a
   * leader's annihilation, "no new injury is gained but the previous two
   * remain". A `removedAt` would be a lie in the ledger, saying the doctor
   * mended something that never happened.
   */
  const dropInjury = useCallback((injuryId) => {
    updateArsenal((a) => ({ injuries: a.injuries.filter((i) => i.id !== injuryId) }))
  }, [updateArsenal])

  /**
   * Three injuries and the model is out — checked at the END of phase 6, never
   * during it, which is why this is called by the flow rather than by
   * `addInjury`.
   *
   * Flagged, not deleted: it stays on the roster so the week it arrived and
   * the scrip it cost are still legible, and `liveModels` keeps it out of the
   * arsenal total and out of every hire.
   */
  const annihilateModel = useCallback((modelId) => {
    updateArsenal((a) => ({
      models: a.models.map((m) => (m.id === modelId ? { ...m, annihilated: true } : m)),
    }))
  }, [updateArsenal])

  /* ── advancement ──────────────────────────────────────────────── */

  /**
   * Check experience boxes and record what each one bought.
   *
   * Boxes and advancements move together on purpose. They are two halves of
   * one fact — the leader is three boxes along *because* of these three
   * advancements — and letting either be written without the other is how a
   * track ends up disagreeing with the list beside it.
   */
  const advanceLeader = useCallback(({ boxes = 0, taken = [] }) => {
    updateArsenal((a) => ({
      leader: {
        ...a.leader,
        experience: { ...a.leader.experience, boxesChecked: (a.leader.experience?.boxesChecked || 0) + boxes },
        advancements: [...(a.leader.advancements || []), ...taken],
      },
    }))
  }, [updateArsenal])

  /** An advancement handed to the totem instead of the leader. */
  const advanceTotem = useCallback((entry) => {
    updateArsenal((a) => (a.totem
      ? { totem: { ...a.totem, advancements: [...a.totem.advancements, entry] } }
      : {}))
  }, [updateArsenal])

  const setTotem = useCallback((patch) => {
    updateArsenal((a) => ({ totem: a.totem ? { ...a.totem, ...patch } : createTotem(patch) }))
  }, [updateArsenal])

  const addCrewCardAdvancement = useCallback((entry) => {
    updateArsenal((a) => ({ crewCardAdvancements: [...(a.crewCardAdvancements || []), entry] }))
  }, [updateArsenal])

  /**
   * Fate intervenes, once. The second annihilation stands.
   *
   * Recorded on the leader rather than inferred from the games, because the
   * box on the arsenal sheet is a box: it is ticked or it is not, and a player
   * who reconstructs a campaign by hand has to be able to tick it.
   */
  const useMiraculousRecovery = useCallback(() => {
    updateArsenal((a) => ({ leader: { ...a.leader, miraculousRecoveryUsed: true } }))
  }, [updateArsenal])

  return {
    // the shelf
    shelf, openId, open, close, startNew, discard, adopt, refresh,
    // the open campaign
    campaign, setCampaignField, setHouseRules,
    arsenal, updateArsenal,
    week, setWeek, stepWeek, setWeekMode, resetWeek, setStartedAt, setWeeksTotal,
    totalCost: arsenal ? totalFor(arsenal) : 0,
    mustHire: arsenal ? mustHireThisWeek(arsenal, week) : false,
    // wizard adapter — same surface the step components already expect
    leader, set: setLeader, setPick,
    addModel, removeModel, spendScrip, earnScrip,
    // games and the aftermath
    logGame, updateGame, removeGame,
    buyEquipment, removeEquipment,
    addInjury, healInjury, dropInjury, annihilateModel,
    advanceLeader, advanceTotem, setTotem, addCrewCardAdvancement,
    useMiraculousRecovery,
  }
}
