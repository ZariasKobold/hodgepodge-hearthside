/**
 * Describing a conflict in the player's language, not the sync layer's.
 *
 * `planSync` can tell you that your copy and the account's copy have both moved
 * since they last agreed. That is a true and completely useless thing to say to
 * a person: "version 4 versus version 7" is a coin toss, not a decision.
 *
 * This turns two documents into the handful of facts somebody actually chooses
 * on — scrip, models, injuries, experience, what each side has that the other
 * does not — so the question becomes "which of these two evenings was the real
 * one?", which is a question the owner can answer in about five seconds.
 *
 * ## Whose conflict this is
 *
 * Always one person's, and always between their own two devices. `useSync` only
 * reconciles documents where `belongsTo(doc, user.id)`, and `campaignStore`
 * refuses any write where `owner_user_id !== userId`. Another player cannot
 * edit your arsenal at all — membership is a read-only pointer between
 * campaigns and writes were never widened. So nothing here has to reason about
 * two people disagreeing; it is one person, two devices, one of which they
 * meant.
 *
 * Pure, and imports nothing (CLAUDE.md §6). It is the part that decides what a
 * person is shown before they overwrite twelve weeks, so it is the part that
 * gets tested.
 */

/**
 * A stable string for a document, ignoring what legitimately differs.
 *
 * Keys are sorted, so two objects that differ only in the order their fields
 * were written compare equal — a document that has been through
 * `JSON.parse(JSON.stringify(…))` on a server round trip is not a different
 * document.
 *
 * `updatedAt` is dropped at the top level and nowhere else: it is a local clock
 * reading that moves on every save, so keeping it would make every comparison
 * report a difference and the whole idea would be worthless.
 */
export function canonical(doc, { drop = ['updatedAt'] } = {}) {
  const seen = new WeakSet()
  const walk = (value, depth) => {
    if (value === null || typeof value !== 'object') return value
    if (seen.has(value)) return '[circular]'
    seen.add(value)
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1))
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (depth === 0 && drop.includes(key)) continue
      out[key] = walk(value[key], depth + 1)
    }
    return out
  }
  return JSON.stringify(walk(doc, 0))
}

/**
 * Do these two documents say the same thing?
 *
 * The one case the app is allowed to settle by itself. If both copies carry the
 * same models, scrip, injuries and history then there is nothing to choose, and
 * asking would be the app performing diligence rather than exercising it.
 *
 * Deliberately strict, and deliberately wrong in the safe direction: a reordered
 * array reads as different, so this under-reports sameness. Being asked about a
 * conflict that did not need asking about costs a click. Auto-resolving one that
 * did costs an evening.
 */
export function sameInSubstance(a, b) {
  if (!a || !b) return false
  return canonical(a) === canonical(b)
}

/* ── summaries: the numbers a player recognises ─────────────────── */

const liveInjuries = (list) => (list || []).filter((i) => !i.removedAt)

export function summariseArsenal(a) {
  if (!a) return null
  const live = (a.models || []).filter((m) => !m.annihilated)
  return {
    leader: a.leader?.name || '(unnamed)',
    scrip: a.scrip ?? 0,
    models: live.length,
    soulstones: live.reduce((sum, m) => sum + (m.cost || 0), 0),
    injuries: liveInjuries(a.injuries).length,
    equipment: (a.equipment || []).length,
    experience: a.leader?.experience?.boxesChecked ?? 0,
    advancements: (a.leader?.advancements || []).length,
    totem: a.totem?.name || null,
  }
}

export function summariseCampaign(c) {
  if (!c) return null
  return {
    name: c.name || '(unnamed)',
    weeksTotal: c.weeksTotal ?? 0,
    week: c.weekMode === 'manual' ? c.manualWeek ?? 1 : null,
    weekMode: c.weekMode || 'calendar',
    weekOffset: c.weekOffset ?? 0,
    games: (c.games || []).length,
    players: (c.participants || []).length,
  }
}

/** Human labels, in the order they should be read. */
const ARSENAL_LABELS = {
  leader: 'Leader',
  scrip: 'Scrip',
  models: 'Models',
  soulstones: 'Arsenal total',
  injuries: 'Injuries',
  equipment: 'Equipment',
  experience: 'Experience boxes',
  advancements: 'Advancements',
  totem: 'Totem',
}

const CAMPAIGN_LABELS = {
  name: 'Name',
  weeksTotal: 'Campaign length',
  week: 'Week',
  weekMode: 'Week mode',
  weekOffset: 'Week adjustment',
  games: 'Games logged',
  players: 'Players',
}

function scalarDifferences(mine, theirs, labels) {
  const out = []
  for (const key of Object.keys(labels)) {
    const a = mine?.[key]
    const b = theirs?.[key]
    if (a === b) continue
    out.push({ key, label: labels[key], mine: a, theirs: b })
  }
  return out
}

/**
 * What one side has that the other does not, by id.
 *
 * This is the half that actually settles it. "Yours has Nekima hired in week 3"
 * is a fact somebody can act on; "9 models versus 8" is a puzzle they have to
 * solve first.
 */
function membership(mineList, theirsList, describe) {
  const mine = new Map((mineList || []).filter((x) => x?.id).map((x) => [x.id, x]))
  const theirs = new Map((theirsList || []).filter((x) => x?.id).map((x) => [x.id, x]))
  const onlyMine = []
  const onlyTheirs = []
  for (const [id, item] of mine) if (!theirs.has(id)) onlyMine.push(describe(item))
  for (const [id, item] of theirs) if (!mine.has(id)) onlyTheirs.push(describe(item))
  return { onlyMine, onlyTheirs }
}

const modelLabel = (m) => `${m.name || 'a model'}${m.addedWeek ? ` (week ${m.addedWeek})` : ''}`
const injuryLabel = (i) => i.name || 'an injury'
const kitLabel = (e) => e.name || 'equipment'
const gameLabel = (g) => `week ${g.week ?? '?'}${g.result ? ` · ${g.result}` : ''}`

/**
 * The whole comparison, ready to render.
 *
 * `kind` decides which summary is used; everything else is the same shape, so
 * the screen does not need two versions of itself.
 */
export function describeConflict({ kind, mine, theirs }) {
  const isArsenal = kind === 'arsenal'
  const mineSummary = isArsenal ? summariseArsenal(mine) : summariseCampaign(mine)
  const theirsSummary = isArsenal ? summariseArsenal(theirs) : summariseCampaign(theirs)

  const differences = scalarDifferences(
    mineSummary,
    theirsSummary,
    isArsenal ? ARSENAL_LABELS : CAMPAIGN_LABELS
  )

  const sets = isArsenal
    ? [
        { label: 'models', ...membership(mine?.models, theirs?.models, modelLabel) },
        { label: 'injuries', ...membership(liveInjuries(mine?.injuries), liveInjuries(theirs?.injuries), injuryLabel) },
        { label: 'equipment', ...membership(mine?.equipment, theirs?.equipment, kitLabel) },
      ]
    : [{ label: 'games', ...membership(mine?.games, theirs?.games, gameLabel) }]

  return {
    kind,
    id: mine?.id ?? theirs?.id ?? null,
    /** Nothing to choose — see `sameInSubstance`. */
    identical: sameInSubstance(mine, theirs),
    mine: { updatedAt: mine?.updatedAt ?? null, summary: mineSummary },
    theirs: { updatedAt: theirs?.updatedAt ?? null, summary: theirsSummary },
    differences,
    sets: sets.filter((s) => s.onlyMine.length > 0 || s.onlyTheirs.length > 0),
  }
}

/**
 * A one-line answer to "which of these is further along?", for a caller that
 * wants to hint without deciding.
 *
 * Explicitly **not** a recommendation about which to keep — further along is not
 * the same as correct, and a device that replayed a week has more games and less
 * truth. It exists so the screen can order the two columns consistently rather
 * than by whichever happened to be fetched first.
 */
export function moreRecent(conflict) {
  const a = conflict?.mine?.updatedAt ?? 0
  const b = conflict?.theirs?.updatedAt ?? 0
  if (a === b) return null
  return a > b ? 'mine' : 'theirs'
}
