import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  saveCampaign, removeCampaign, setActiveCampaignId,
  saveArsenal, removeArsenal, activeArsenalId, setActiveArsenalId,
  adoptLegacyCampaign, forgetVersion, arsenalIds,
} from '../lib/storage.js'
import {
  liftLocalShelfToV3, readShelf, readSeated, createSeatedArsenal, saveSeated,
  forgetSeated, participationForArsenal, isSoloTable,
} from '../lib/shelf.js'
import {
  createModel, createEquipment, createInjury, createTotem,
  totalFor, mustHireThisWeek, startingScripPatch, owedStartingScrip,
} from '../lib/shape/arsenal.js'
import {
  createCampaign, createGame, currentWeek, joinedWeekFor,
  setWeekPatch, stepWeekPatch, weekModePatch, canRegress,
  MIN_WEEKS_TOTAL, MAX_WEEKS_TOTAL,
} from '../lib/shape/campaign.js'
import { belongsTo, shouldRelease } from '../lib/shape/ownership.js'
import { unwindArsenal } from '../lib/rewind.js'
import { readBundle, refileForImport } from '../lib/shape/migrate.js'

/**
 * A shelf of arsenals, one of which may be open, each sitting at a table.
 *
 * **This is the v3 shape** (`docs/data-model-v3.md`). An arsenal is a durable
 * personal object — a leader, their models, scrip, injuries, equipment and
 * experience — that exists before and independently of any campaign. A campaign
 * is the table: weeks, house rules, who is playing, and the games. The join
 * between them is a participation.
 *
 * What a player has open is an **arsenal**; the campaign comes along because the
 * arsenal names it. A solo player's campaign is created silently by
 * `createSeatedArsenal` and never mentioned, so soloing and a table of five run
 * exactly one code path.
 *
 * Both documents are held in state and written separately, because they are two
 * documents. Everything derived — the week, the arsenal total, whether a hire is
 * owed — is computed on read; a stored copy is a copy that goes stale.
 *
 * Local-first is not a stepping stone to remote, it is the fallback that has to
 * keep working. Both documents sync as of v0.21.0, each with its own endpoint
 * and its own server-assigned version, planned by the same `planSync` called
 * once per kind.
 */
export function useCampaign({ userId = null, userReady = true, onSaved, onArsenalSaved, onRemoved, onArsenalRemoved } = {}) {
  const [entries, setEntries] = useState(() => {
    // One-time lifts, oldest first: the single-campaign key everything before
    // the shelf wrote to, then the v2 → v3 split. Both are safe to re-run.
    adoptLegacyCampaign()
    liftLocalShelfToV3()
    return readShelf()
  })

  const [openId, setOpenId] = useState(() => {
    const active = activeArsenalId()
    return active && arsenalIds().includes(active) ? active : null
  })

  /**
   * The exact objects the save effects below have already persisted.
   *
   * Seeded at every point a document is *read* from storage — on mount, on
   * `open`, and after a refresh — because reading is not editing. The comparison
   * is by identity, which only works if every read path seeds it: the loaders
   * build a new object on each call, so an unseeded read is indistinguishable
   * from an edit.
   *
   * This was the bug that repeatedly destroyed a leader portrait (v0.18.4). No
   * read path seeded it, so the first render after a load wrote the campaign
   * back with a fresh `updatedAt` and mirrored it to the account — merely
   * opening the app made this device's copy the newest in existence, and it won
   * every merge, including against copies that were genuinely newer. The act of
   * looking was the act of destroying. Two documents now, so two refs.
   */
  const lastArsenal = useRef(null)
  const lastCampaign = useRef(null)

  const [{ arsenal, campaign }, setSeated] = useState(() => {
    const active = activeArsenalId()
    const seated = active ? readSeated(active) : { arsenal: null, campaign: null }
    lastArsenal.current = seated.arsenal
    lastCampaign.current = seated.campaign
    return seated
  })

  const setArsenal = useCallback((patch) => {
    setSeated((prev) => (prev.arsenal
      ? { ...prev, arsenal: { ...prev.arsenal, ...(typeof patch === 'function' ? patch(prev.arsenal) : patch) } }
      : prev))
  }, [])

  const setCampaign = useCallback((patch) => {
    setSeated((prev) => (prev.campaign
      ? { ...prev, campaign: { ...prev.campaign, ...(typeof patch === 'function' ? patch(prev.campaign) : patch) } }
      : prev))
  }, [])

  /**
   * The shelf, scoped to the account — but only once there is an answer about
   * who that is. `useAuth` reports `user: null` while its first /api/auth/me is
   * in flight, and "nobody is signed in" and "we have not asked yet" are
   * different answers. Treating the first as the second hid every claimed
   * arsenal for the length of that request.
   */
  const shelf = useMemo(
    () => entries
      .map((e) => (e.arsenal.id === openId && arsenal ? { arsenal, campaign } : e))
      .filter((e) => (userReady ? belongsTo(e.arsenal, userId) : true)),
    [entries, openId, arsenal, campaign, userId, userReady]
  )

  /**
   * An arsenal belonging to another account must not stay open across a
   * sign-in. Closing rather than deleting: their work is still theirs and is
   * still on the disk, it simply is not this account's to look at.
   *
   * Waits for auth to settle — without the guard this ran during the first
   * /api/auth/me, closed a campaign the signed-in user owned, and wrote that
   * closure to storage, so it stayed shut afterwards.
   */
  useEffect(() => {
    if (!shouldRelease(arsenal, userId, userReady)) return
    setSeated({ arsenal: null, campaign: null })
    setOpenId(null)
    setActiveArsenalId(null)
    setActiveCampaignId(null)
  }, [arsenal, userId, userReady])

  // Two documents, two writes, each skipping one that was only just read.
  useEffect(() => {
    if (!arsenal) return
    if (lastArsenal.current === arsenal) return
    lastArsenal.current = arsenal
    // Claim on first save while signed in. Only ever set on an unclaimed
    // object — re-stamping one that already carries an id would be one account
    // taking another's work rather than adopting loose work.
    const claimed = userId && !arsenal.ownerUserId ? { ...arsenal, ownerUserId: userId } : arsenal
    const stamped = saveArsenal(claimed)
    // The mirror upward is best-effort and never gates the local write, which
    // has already happened synchronously and is what the app reads.
    if (stamped) onArsenalSaved?.(stamped)
  }, [arsenal, userId, onArsenalSaved])

  useEffect(() => {
    if (!campaign) return
    if (lastCampaign.current === campaign) return
    lastCampaign.current = campaign
    const claimed = userId && !campaign.ownerUserId ? { ...campaign, ownerUserId: userId } : campaign
    const stamped = saveCampaign(claimed)
    if (stamped) onSaved?.(stamped)
  }, [campaign, userId, onSaved])

  /** Re-reads the shelf from storage, after a sync pulled rows down. */
  const refresh = useCallback(() => {
    setEntries(readShelf())
    setSeated((prev) => {
      if (!prev.arsenal) return prev
      const fresh = readSeated(prev.arsenal.id)
      if (!fresh.arsenal) return prev
      // Straight from storage, so it must not be written back.
      lastArsenal.current = fresh.arsenal
      lastCampaign.current = fresh.campaign
      return fresh
    })
  }, [])

  /* ── the shelf ────────────────────────────────────────────────── */

  const open = useCallback((id) => {
    const found = readSeated(id)
    if (!found.arsenal) return
    if (!belongsTo(found.arsenal, userId)) return
    // Read, not edited.
    lastArsenal.current = found.arsenal
    lastCampaign.current = found.campaign
    setSeated(found)
    setOpenId(id)
    setActiveArsenalId(id)
    if (found.campaign) setActiveCampaignId(found.campaign.id)
  }, [userId])

  const close = useCallback(() => {
    setSeated({ arsenal: null, campaign: null })
    setOpenId(null)
    setActiveArsenalId(null)
    setActiveCampaignId(null)
  }, [])

  const startNew = useCallback(() => {
    const fresh = createSeatedArsenal({ ownerUserId: userId ?? null })
    saveSeated(fresh)
    lastArsenal.current = fresh.arsenal
    lastCampaign.current = fresh.campaign
    setEntries(readShelf())
    setSeated(fresh)
    setOpenId(fresh.arsenal.id)
    setActiveArsenalId(fresh.arsenal.id)
    setActiveCampaignId(fresh.campaign.id)
    return fresh.arsenal.id
  }, [userId])

  const discard = useCallback((id) => {
    const { campaign: table } = readSeated(id)
    forgetSeated(id, { removeArsenal, removeCampaign, forgetVersion })
    onArsenalRemoved?.(id)
    // The campaign only goes when nobody else was sitting at it — `forgetSeated`
    // decides that, so ask it the same question rather than guessing here.
    if (table && isSoloTable(table, id)) onRemoved?.(table.id)
    setEntries(readShelf())
    setOpenId((prev) => (prev === id ? null : prev))
    setSeated((prev) => (prev.arsenal?.id === id ? { arsenal: null, campaign: null } : prev))
  }, [onRemoved])

  /**
   * Files an imported file as new entries rather than replacing anything.
   *
   * `refileForImport` mints fresh ids for every arsenal and campaign and
   * repoints every link between them, so importing the same export twice gives
   * two of everything and nothing already on the shelf can be lost. An arsenal
   * whose campaign is not in the file arrives detached and gets a table of its
   * own, rather than pointing at a campaign id that may belong to somebody else
   * on this browser.
   */
  const adopt = useCallback((data) => {
    const { campaigns, arsenals } = refileForImport(readBundle(data))
    if (arsenals.length === 0) {
      throw new Error('That file does not look like a leader or a campaign — no arsenals in it.')
    }

    const byId = new Map(campaigns.map((c) => [c.id, c]))
    for (const c of campaigns) saveCampaign(c)

    let first = null
    for (const a of arsenals) {
      if (a.campaignId && byId.has(a.campaignId)) {
        saveArsenal(a)
        if (!first) first = { arsenal: a, campaign: byId.get(a.campaignId) }
        continue
      }
      // Detached: give it a table of its own, by the same silent path a new
      // leader gets one.
      const seated = createSeatedArsenal(a)
      saveSeated(seated)
      if (!first) first = seated
    }

    setEntries(readShelf())
    if (first) {
      lastArsenal.current = first.arsenal
      lastCampaign.current = first.campaign
      setSeated(first)
      setOpenId(first.arsenal.id)
      setActiveArsenalId(first.arsenal.id)
      if (first.campaign) setActiveCampaignId(first.campaign.id)
    }
    return first?.arsenal.id ?? null
  }, [])

  /* ── the open pair ────────────────────────────────────────────── */

  const week = useMemo(() => (campaign ? currentWeek(campaign) : 1), [campaign])
  const joinedWeek = useMemo(
    () => (campaign && arsenal ? joinedWeekFor(campaign, arsenal.id) : 1),
    [campaign, arsenal]
  )

  const updateArsenal = setArsenal
  const setCampaignField = setCampaign

  const setHouseRules = useCallback((patch) => {
    setCampaign((prev) => ({ houseRules: { ...prev.houseRules, ...patch } }))
  }, [setCampaign])

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

    setArsenal((a) => {
      const merged = {
        ...a,
        ...arsenalPatch,
        leader: Object.keys(leaderPatch).length ? { ...a.leader, ...leaderPatch } : a.leader,
      }
      // Adding or dropping a starting model changes what p. 15 owes, and this
      // is the one path the creation screen edits models through. Safe on every
      // models patch: `startingScripPatch` reads week-0 models only, so a weekly
      // hire cannot reach it, and it returns null when the grant has not moved.
      const owed = 'models' in arsenalPatch ? startingScripPatch(merged) : null
      return { ...arsenalPatch, leader: merged.leader, ...(owed || {}) }
    })
  }, [leader, setArsenal])

  const setPick = useCallback((slot, entriesForSlot) => {
    setArsenal((a) => ({ leader: { ...a.leader, picks: { ...a.leader.picks, [slot]: entriesForSlot } } }))
  }, [setArsenal])

  /**
   * Pay starting scrip to an arsenal built before this was fixed.
   *
   * Offered rather than applied on load. Moving the scrip on somebody's
   * in-progress campaign without telling them is indistinguishable from a bug.
   */
  const creditStartingScrip = useCallback(() => {
    setArsenal((a) => startingScripPatch(a) || {})
  }, [setArsenal])

  /* ── arsenal actions ──────────────────────────────────────────── */

  const addModel = useCallback((model, { scripPaid = 0 } = {}) => {
    setArsenal((a) => ({ models: [...a.models, createModel({ ...model, addedWeek: week, scripPaid })] }))
  }, [setArsenal, week])

  const removeModel = useCallback((modelId) => {
    setArsenal((a) => ({ models: a.models.filter((m) => m.id !== modelId) }))
  }, [setArsenal])

  const spendScrip = useCallback((amount) => {
    setArsenal((a) => ({ scrip: Math.max(0, a.scrip - amount) }))
  }, [setArsenal])

  const earnScrip = useCallback((amount) => {
    setArsenal((a) => ({ scrip: a.scrip + amount }))
  }, [setArsenal])

  /* ── the week — a fact about the table, not the player ────────── */

  const setWeek = useCallback((target) => {
    setCampaign((prev) => setWeekPatch(prev, target))
  }, [setCampaign])

  /** Forward or back a week. Regressing is as real a need as advancing. */
  const stepWeek = useCallback((delta) => {
    setCampaign((prev) => (delta < 0 && !canRegress(prev) ? {} : stepWeekPatch(prev, delta)))
  }, [setCampaign])

  const setWeekMode = useCallback((mode) => {
    setCampaign((prev) => weekModePatch(prev, mode))
  }, [setCampaign])

  /** Back to whatever the calendar says, discarding every past correction. */
  const resetWeek = useCallback(() => {
    setCampaign({ weekOffset: 0 })
  }, [setCampaign])

  /**
   * When the campaign actually began. Editable because the app is usually
   * opened *after* the first game — the campaign started at the table, not when
   * someone got round to typing it in.
   */
  const setStartedAt = useCallback((timestamp) => {
    setCampaign({ startedAt: timestamp })
  }, [setCampaign])

  const setWeeksTotal = useCallback((n) => {
    setCampaign({
      weeksTotal: Math.min(MAX_WEEKS_TOTAL, Math.max(MIN_WEEKS_TOTAL, Math.round(Number(n) || 1))),
    })
  }, [setCampaign])

  /* ── games and the aftermath — they live on the table ─────────── */

  const logGame = useCallback((patch = {}) => {
    const game = createGame({ arsenalId: arsenal?.id ?? null, week, ...patch })
    setCampaign((prev) => ({ games: [...prev.games, game] }))
    return game
  }, [setCampaign, arsenal?.id, week])

  const updateGame = useCallback((gameId, patch) => {
    setCampaign((prev) => ({
      games: prev.games.map((g) => (g.id === gameId ? { ...g, ...(typeof patch === 'function' ? patch(g) : patch) } : g)),
    }))
  }, [setCampaign])

  const removeGame = useCallback((gameId) => {
    setCampaign((prev) => ({ games: prev.games.filter((g) => g.id !== gameId) }))
  }, [setCampaign])

  /* ── equipment ────────────────────────────────────────────────── */

  const buyEquipment = useCallback((entry, cost) => {
    setArsenal((a) => ({
      equipment: [...a.equipment, createEquipment({ ...entry, acquiredWeek: week })],
      scrip: Math.max(0, a.scrip - cost),
    }))
  }, [setArsenal, week])

  /**
   * Equipment leaves the arsenal outright when annihilated — it "may not be
   * used until purchased again" — so this deletes rather than flagging.
   */
  const removeEquipment = useCallback((id) => {
    setArsenal((a) => ({ equipment: a.equipment.filter((e) => e.id !== id) }))
  }, [setArsenal])

  /* ── injuries ─────────────────────────────────────────────────── */

  const addInjury = useCallback((entry) => {
    setArsenal((a) => ({ injuries: [...a.injuries, createInjury({ ...entry, gainedWeek: week })] }))
  }, [setArsenal, week])

  /**
   * Healed rather than deleted. The doctor's ledger is part of the story, and
   * an injury that was paid to remove still happened.
   */
  const healInjury = useCallback((injuryId) => {
    setArsenal((a) => ({
      injuries: a.injuries.map((i) => (i.id === injuryId ? { ...i, removedAt: Date.now() } : i)),
    }))
  }, [setArsenal])

  /**
   * Deleted, not healed — for an injury that was never gained. The one case is
   * Fate intervening: "no new injury is gained but the previous two remain". A
   * `removedAt` would put a visit to Dr. Mo in the ledger that never happened.
   */
  const dropInjury = useCallback((injuryId) => {
    setArsenal((a) => ({ injuries: a.injuries.filter((i) => i.id !== injuryId) }))
  }, [setArsenal])

  /**
   * Three injuries and the model is out — checked at the END of phase 6, which
   * is why this is called by the flow rather than by `addInjury`. Flagged, not
   * deleted: the week it arrived and the scrip it cost stay legible.
   */
  const annihilateModel = useCallback((modelId) => {
    setArsenal((a) => ({
      models: a.models.map((m) => (m.id === modelId ? { ...m, annihilated: true } : m)),
    }))
  }, [setArsenal])

  /* ── advancement ──────────────────────────────────────────────── */

  /**
   * Check experience boxes and record what each one bought. Boxes and
   * advancements move together on purpose — they are two halves of one fact,
   * and letting either be written without the other is how a track ends up
   * disagreeing with the list beside it.
   */
  const advanceLeader = useCallback(({ boxes = 0, taken = [] }) => {
    setArsenal((a) => ({
      leader: {
        ...a.leader,
        experience: { ...a.leader.experience, boxesChecked: (a.leader.experience?.boxesChecked || 0) + boxes },
        advancements: [...(a.leader.advancements || []), ...taken],
      },
    }))
  }, [setArsenal])

  const advanceTotem = useCallback((entry) => {
    setArsenal((a) => (a.totem ? { totem: { ...a.totem, advancements: [...a.totem.advancements, entry] } } : {}))
  }, [setArsenal])

  const setTotem = useCallback((patch) => {
    setArsenal((a) => ({ totem: a.totem ? { ...a.totem, ...patch } : createTotem(patch) }))
  }, [setArsenal])

  const addCrewCardAdvancement = useCallback((entry) => {
    setArsenal((a) => ({ crewCardAdvancements: [...(a.crewCardAdvancements || []), entry] }))
  }, [setArsenal])

  /**
   * Fate intervenes, once. The second annihilation stands. Recorded on the
   * leader rather than inferred from the games, because the box on the arsenal
   * sheet is a box: it is ticked or it is not.
   */
  /**
   * Put the arsenal back to before these aftermath phases ran.
   *
   * The arithmetic is `unwindArsenal`, which is pure and tested; this is only
   * the seam that writes it. Everything it reverses is named in the aftermath
   * record, so nothing had to be tagged — the record *is* the provenance.
   */
  const rewindPhases = useCallback((record, phaseIds, order) => {
    setArsenal((a) => unwindArsenal(a, record, phaseIds, { order }))
  }, [setArsenal])

  const useMiraculousRecovery = useCallback(() => {
    setArsenal((a) => ({ leader: { ...a.leader, miraculousRecoveryUsed: true } }))
  }, [setArsenal])

  return {
    // the shelf — entries are { arsenal, campaign }
    shelf, openId, open, close, startNew, discard, adopt, refresh,
    // the open pair
    campaign, setCampaignField, setHouseRules,
    arsenal, updateArsenal,
    week, joinedWeek,
    setWeek, stepWeek, setWeekMode, resetWeek, setStartedAt, setWeeksTotal,
    totalCost: arsenal ? totalFor(arsenal) : 0,
    mustHire: arsenal ? mustHireThisWeek(arsenal, week, { joinedWeek }) : false,
    // wizard adapter — same surface the step components already expect
    leader, set: setLeader, setPick,
    addModel, removeModel, spendScrip, earnScrip,
    creditStartingScrip,
    owedStartingScrip: arsenal ? owedStartingScrip(arsenal) : 0,
    // games and the aftermath
    logGame, updateGame, removeGame,
    buyEquipment, removeEquipment,
    addInjury, healInjury, dropInjury, annihilateModel,
    advanceLeader, advanceTotem, setTotem, addCrewCardAdvancement,
    rewindPhases,
    useMiraculousRecovery,
    // the participation, for anything that needs the seat rather than the player
    participation: campaign && arsenal ? participationForArsenal(campaign, arsenal.id) : null,
  }
}
