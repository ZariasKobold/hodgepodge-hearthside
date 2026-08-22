/**
 * Rules text — fetched live, displayed, never kept.
 *
 * CLAUDE.md §4 bars storing rules text for two reasons: republishing Wyrd's
 * card text competes with the funnel that sells the cards, and errata would
 * make this app the text's permanent maintainer. The second reason is what
 * this module is built around. Nothing here ever reaches `storage.js`.
 * Descriptions live in a module-level Map that dies with the tab, so a Wyrd
 * errata takes effect on the next page load, and no export, no localStorage
 * key and no D1 row ever carries a line of it.
 *
 * `indexing.js` is untouched and still strips every description on the way
 * into the roster. That remains the path everything persisted travels. This is
 * a second, parallel, display-only path — which is why the two normalisers
 * look similar and must not be merged: one is deliberately lossy and the other
 * deliberately is not.
 *
 * Imports nothing from React (§6).
 */
import { registry } from './api.js'

/* ── icon markup ───────────────────────────────────────────────────────
   The register embeds card icons as {{token}}. The vocabulary is small and
   closed, but the source data carries typos ({{missle}}, {{{pulse}}), so the
   parser is deliberately forgiving: unknown tokens render as a plain word
   rather than leaking braces into the page. */

const ICONS = {
  melee: 'Melee',
  missile: 'Missile',
  missle: 'Missile', // upstream typo
  pulse: 'Pulse',
  magic: 'Magic',
  stone: 'Soulstone',
  signature: 'Signature',
  fortitude: 'Fortitude',
  warding: 'Warding',
  unusual: 'Unusual',
  unnatural: 'Unnatural',
  ram: 'Ram',
  crow: 'Crow',
  tome: 'Tome',
  mask: 'Mask',
}

const TOKEN = /\{{2,}([^{}]*?)\}{1,}/g

function iconLabel(raw) {
  const inner = String(raw).trim()
  if (inner === '+') return '+'
  if (inner === '-') return '−'
  const key = inner.toLowerCase().replace(/[^a-z]/g, '')
  if (ICONS[key]) return ICONS[key]
  if (!key) return inner
  return key.charAt(0).toUpperCase() + key.slice(1)
}

/**
 * On the card an icon butts straight against its measurement — {{pulse}}2" is
 * a glyph and a number touching. Spelled out as a word it needs the space back
 * or it reads as "Pulse2". Single-character labels (+, −) keep the tight set,
 * since those genuinely do sit against the surrounding punctuation.
 */
function needsGap(label, nextChar) {
  return label.length > 1 && nextChar != null && !/\s/.test(nextChar)
}

/**
 * Splits description text into runs for React, so icons can be styled apart
 * from prose without dangerouslySetInnerHTML.
 */
export function iconSegments(text) {
  const source = String(text ?? '')
  const out = []
  let last = 0
  for (const match of source.matchAll(TOKEN)) {
    if (match.index > last) out.push({ kind: 'text', value: source.slice(last, match.index) })
    const label = iconLabel(match[1])
    out.push({ kind: 'icon', value: label })
    last = match.index + match[0].length
    if (needsGap(label, source[last])) out.push({ kind: 'text', value: ' ' })
  }
  if (last < source.length) out.push({ kind: 'text', value: source.slice(last) })
  return out
}

/** The same text flattened — for the canvas exporter, which has no spans. */
export function plainText(text) {
  const source = String(text ?? '')
  return source.replace(TOKEN, (match, inner, offset) => {
    const label = iconLabel(inner)
    return needsGap(label, source[offset + match.length]) ? `${label} ` : label
  })
}

/* ── normalising a register record ─────────────────────────────────── */

function toTrigger(t) {
  return {
    name: t.name,
    slug: t.slug,
    suits: t.suits || null,
    stoneCost: t.stone_cost || 0,
    description: t.description || '',
  }
}

function toAction(a) {
  return {
    name: a.name,
    slug: a.slug,
    type: a.type,
    typeLabel: a.type_label || a.type,
    isSignature: Boolean(a.is_signature),
    stoneCost: a.stone_cost || 0,
    range: a.range ?? null,
    rangeTypeLabel: a.range_type_label || null,
    stat: a.stat ?? null,
    statSuits: a.stat_suits || null,
    statModifier: a.stat_modifier || null,
    resistedBy: a.resisted_by || null,
    targetNumber: a.target_number ?? null,
    targetSuits: a.target_suits || null,
    damage: a.damage ?? null,
    description: a.description || '',
    triggers: (a.triggers || []).map(toTrigger),
  }
}

function toAbility(a) {
  return {
    name: a.name,
    slug: a.slug,
    suits: a.suits || null,
    costsStone: a.costs_stone || 0,
    description: a.description || '',
  }
}

/** Keeps everything, including the descriptions `toIndexedModel` throws away. */
export function toCard(record) {
  return {
    slug: record.slug,
    name: record.display_name || record.name,
    cost: record.cost ?? null,
    factionLabel: record.faction_label || record.faction || '',
    secondFactionLabel: record.second_faction_label || null,
    stationLabel: record.station_label || null,
    keywords: (record.keywords || []).map((k) => k.name),
    characteristics: record.characteristics || [],
    size: record.size ?? null,
    baseLabel: record.base_label || (record.base ? `${record.base}mm` : null),
    health: record.health ?? null,
    defense: record.defense ?? null,
    defenseSuit: record.defense_suit || null,
    willpower: record.willpower ?? null,
    willpowerSuit: record.willpower_suit || null,
    speed: record.speed ?? null,
    actions: (record.actions || []).map(toAction),
    abilities: (record.abilities || []).map(toAbility),
  }
}

/* ── reading a card ────────────────────────────────────────────────── */

/** Curly and straight apostrophes both occur upstream. */
const norm = (s) =>
  String(s ?? '').replace(/[‘’ʼ]/g, "'").trim().toLowerCase()

export function findAction(card, name) {
  if (!card) return null
  return card.actions.find((a) => norm(a.name) === norm(name)) || null
}

export function findAbility(card, name) {
  if (!card) return null
  return card.abilities.find((a) => norm(a.name) === norm(name)) || null
}

/** One lookup for either kind, because a slot name maps straight onto it. */
export function findEntry(card, slot, name) {
  return slot === 'ability' ? findAbility(card, name) : findAction(card, name)
}

/**
 * One trigger on one action, by name.
 *
 * Used for the single trigger a Heavy Hitter keeps. Taking an action from an
 * ally does **not** bring that action's triggers with it — they are earned in
 * campaign play or granted at creation — so this is a deliberate lookup of the
 * one the leader actually holds, never a way to list the rest.
 */
export function findTrigger(action, name) {
  if (!action) return null
  return (action.triggers || []).find((t) => norm(t.name) === norm(name)) || null
}

/**
 * The source model's slug, recovered from a selection key.
 *
 * `candidatesFor` builds keys as `slug::slot::name`; `ManualPick` builds them
 * as `manual::model::name` and flags the pick. Hand-entered picks have no
 * register record to read, so they return null and simply show no text.
 */
export function sourceSlug(pick) {
  if (!pick || pick.manual) return null
  const head = String(pick.key || '').split('::')[0]
  return head && head !== 'manual' ? head : null
}

/** The compact stat line above an action's text. Order follows the printed card. */
export function statLine(action) {
  if (!action) return []
  const parts = []

  if (action.stoneCost > 0) parts.push(`${action.stoneCost}ss`)
  if (action.isSignature) parts.push('Signature')

  if (action.range != null && action.range !== '') {
    const measure = action.range === '*' ? '*' : `${action.range}"`
    parts.push(action.rangeTypeLabel ? `${action.rangeTypeLabel} ${measure}` : `Rg ${measure}`)
  }

  if (action.stat != null && action.stat !== '') {
    let stat = `Stat ${action.stat}`
    if (action.statSuits) stat += ` ${action.statSuits}`
    if (action.statModifier) stat += ` ${action.statModifier}`
    parts.push(stat)
  }

  if (action.resistedBy) parts.push(`vs ${action.resistedBy}`)
  if (action.targetNumber != null && action.targetNumber !== '') {
    parts.push(`TN ${action.targetNumber}${action.targetSuits ? ` ${action.targetSuits}` : ''}`)
  }
  if (action.damage != null && action.damage !== '') parts.push(`Dmg ${action.damage}`)

  return parts
}

/* ── the memory-only cache ─────────────────────────────────────────── */

const cache = new Map()
const inflight = new Map()

/** Synchronous read. Null means "not fetched", not "no such model". */
export function cachedCard(slug) {
  return cache.get(slug) || null
}

/** Deduplicates concurrent requests for the same model — hover fires a lot. */
export function fetchCard(slug, opts) {
  if (!slug) return Promise.resolve(null)
  if (cache.has(slug)) return Promise.resolve(cache.get(slug))
  if (inflight.has(slug)) return inflight.get(slug)

  const pending = registry
    .character(slug, opts)
    .then((record) => {
      const card = toCard(record)
      cache.set(slug, card)
      inflight.delete(slug)
      return card
    })
    .catch((err) => {
      inflight.delete(slug)
      throw err
    })

  inflight.set(slug, pending)
  return pending
}

/** For tests, and for sign-out, where holding someone's text around is rude. */
export function forgetCards() {
  cache.clear()
  inflight.clear()
}
