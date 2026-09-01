/**
 * Local-first persistence.
 *
 * Permission to build on Wyrd's IP is revocable at any time, so a campaign has
 * to survive this app going away. Everything is stored under one key per
 * campaign and exports whole to JSON.
 */
const PREFIX = 'hodgepodge:'

const memory = new Map()

function backing() {
  try {
    const probe = '__bs__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

export function save(key, value) {
  const json = JSON.stringify(value)
  const store = backing()
  if (store) store.setItem(PREFIX + key, json)
  else memory.set(key, json)
}

export function load(key, fallback = null) {
  const store = backing()
  const raw = store ? store.getItem(PREFIX + key) : memory.get(key)
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function remove(key) {
  const store = backing()
  if (store) store.removeItem(PREFIX + key)
  else memory.delete(key)
}

/**
 * Hands a blob to the browser as a download.
 *
 * The anchor goes into the document and the object URL is revoked on a later
 * turn of the event loop rather than on the next line. Revoking immediately
 * races the download the click just started: the browser may not have read the
 * blob yet, and the file lands as a half-written `.crdownload` that never
 * finishes. Data portability is a requirement here (§8), so this path is worth
 * the extra four lines.
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 30_000)
}

export function exportJSON(data, filename) {
  downloadBlob(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    filename
  )
}

export function importJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result))
      } catch (err) {
        reject(new Error('That file is not valid campaign JSON.'))
      }
    }
    reader.onerror = () => reject(new Error('Could not read that file.'))
    reader.readAsText(file)
  })
}

/* ── the campaign library ────────────────────────────────────────────
   One key per campaign plus an index of ids, rather than one blob holding
   everything. A twelve-week campaign is the unit people think in, and each one
   belongs to a different leader — so switching leaders is opening a different
   file, not editing a list inside one.

   The index stores ids and nothing else. Leader name, faction and keywords all
   live in the campaign, and a copy in the index is a copy that goes stale the
   moment someone renames their leader (campaignShape.js: nothing derived is
   stored). Rendering the shelf reads each campaign; there are a handful, and
   they are already in localStorage. */

const INDEX_KEY = 'campaigns:index'
const ACTIVE_KEY = 'campaigns:active'
const LEGACY_SINGLE = 'campaign:current'

/**
 * The server version each campaign is known to be based on.
 *
 * Kept in its own key, **not on the campaign**, and the difference is not
 * cosmetic. The first attempt stored it as `campaign.syncedAt` and it was wiped
 * by the next keystroke: `useCampaign` holds the campaign in React state and
 * writes that state to storage on every edit, and that state has never heard of
 * a field the sync layer added behind it. Every save after the first therefore
 * pushed with no base version, was refused as stale, and could never recover.
 *
 * It also does not belong in the doc on principle. This is per-device sync
 * bookkeeping, not campaign data — it would otherwise ride into the JSON export
 * and into `doc` on the server, where it means nothing and would be wrong the
 * moment the file was imported somewhere else.
 */
const VERSION_PREFIX = 'campaign-version:'
/**
 * Set when this device edits a campaign, cleared when the account has the
 * edit. Kept beside the version rather than on the campaign for the reason
 * the version is: `useCampaign` writes React state to storage on every edit,
 * and that state has never heard of fields the sync layer adds behind it — a
 * flag on the doc was wiped by the next keystroke. It is also not campaign
 * data, and would be meaningless inside a JSON export or an import.
 */
const DIRTY_PREFIX = 'campaign-dirty:'

const campaignKey = (id) => `campaign:${id}`

export function campaignIds() {
  const ids = load(INDEX_KEY, [])
  return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
}

export function loadCampaign(id) {
  return id ? load(campaignKey(id)) : null
}

/**
 * Writes the campaign and makes sure its id is on the shelf.
 *
 * Stamps `updatedAt` unless the caller supplies one. The sync merge decides
 * which copy of a campaign wins by comparing these, so a save that forgot to
 * move the clock would make a newer local edit lose to an older remote row.
 * `keepTimestamp` is for writes that came *from* the server, where the server's
 * clock is the authority and restamping would claim a local edit that never
 * happened.
 */
export function saveCampaign(campaign, { keepTimestamp = false } = {}) {
  if (!campaign?.id) return null
  const stamped = keepTimestamp ? campaign : { ...campaign, updatedAt: Date.now() }
  save(campaignKey(stamped.id), stamped)
  // `keepTimestamp` is how a *pull* writes, and a pull is the account handing
  // us its own copy — the opposite of an unsent edit. Every other caller is a
  // local edit and owes the account a push.
  if (!keepTimestamp) markDirty(stamped.id, true)
  const ids = campaignIds()
  if (!ids.includes(stamped.id)) save(INDEX_KEY, [...ids, stamped.id])
  return stamped
}

export function removeCampaign(id) {
  remove(campaignKey(id))
  save(INDEX_KEY, campaignIds().filter((x) => x !== id))
  if (activeCampaignId() === id) setActiveCampaignId(null)
}

export function activeCampaignId() {
  return load(ACTIVE_KEY, null)
}

export function setActiveCampaignId(id) {
  if (id) save(ACTIVE_KEY, id)
  else remove(ACTIVE_KEY)
}

/**
 * Lifts the single stored campaign onto the shelf.
 *
 * Everything before this shipped one campaign under one fixed key. Runs once,
 * leaves the old key alone rather than deleting it — if this goes wrong, the
 * only copy of somebody's twelve weeks should still be where it was.
 */
export function adoptLegacyCampaign() {
  if (campaignIds().length > 0) return null
  const legacy = load(LEGACY_SINGLE)
  if (!legacy?.id) return null
  saveCampaign(legacy)
  setActiveCampaignId(legacy.id)
  return legacy.id
}

/** The server version this device last saw for a campaign, or null. */
export function knownVersion(id) {
  const v = load(VERSION_PREFIX + id, null)
  return Number.isFinite(v) ? v : null
}

/** Records the version the server just told us about. */
export function rememberVersion(id, version) {
  if (!id || !Number.isFinite(version)) return
  save(VERSION_PREFIX + id, version)
}

/** Forgotten with the campaign, so a re-import is not mistaken for a known copy. */
export function forgetVersion(id) {
  if (!id) return
  remove(VERSION_PREFIX + id)
  remove(DIRTY_PREFIX + id)
}

/**
 * Has this device edited its copy since the account last saw it?
 *
 * `null` means nobody has ever said — a campaign that predates the flag. That
 * is deliberately distinct from `false`: "not edited" licenses `planSync` to
 * pull over the local copy, and guessing that about a campaign we know nothing
 * about would throw away an offline edit made before this shipped.
 */
export function isDirty(id) {
  const v = load(DIRTY_PREFIX + id, null)
  return typeof v === 'boolean' ? v : null
}

/** Marked on every local edit, cleared once the account has it. */
export function markDirty(id, dirty = true) {
  if (!id) return
  save(DIRTY_PREFIX + id, !!dirty)
}
