#!/usr/bin/env node
/**
 * Find which book entries BiggerHat already carries, and write
 * `src/data/bookSources.js`.
 *
 *   node scripts/book-sources.mjs
 *
 * Owner decision, v0.37.0: wherever an advancement is the same trigger, action
 * or ability as one on a published card, the app reads it live from BiggerHat,
 * exactly like card text (§4), and the book's copy is never loaded into D1.
 *
 * **Same means the same, not merely the same name.** Several cards share an
 * action name with different stats or effects, so a match needs:
 *
 *   - the name, exactly (curly quotes and case aside);
 *   - for an action, the same range, Skl, resist, TN and damage;
 *   - for a trigger, the same suit; for an ability, the same defence symbol;
 *   - the same text, after icons and punctuation are normalised.
 *
 * Anything less stays on the book's copy. A book action with a trigger written
 * into it never matches, because a register action carries its source card's
 * triggers, which the leader does not get (§4).
 *
 * Only identifiers are written: the endpoint and the slug. No text.
 *
 * BiggerHat allows 30 requests a minute, so this paces itself and caches every
 * answer in `book/biggerhat-cache.json` (gitignored with the rest of `book/`).
 * Delete that file to ask again, after a register update.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bookFile = path.join(root, 'book', 'book.json')
const cacheFile = path.join(root, 'book', 'biggerhat-cache.json')
const outFile = path.join(root, 'src', 'data', 'bookSources.js')
const UPSTREAM = 'https://biggerhat.net/api/v1'

if (!fs.existsSync(bookFile)) {
  console.error('No book/book.json. Run `node scripts/book-extract.mjs` first.')
  process.exit(1)
}

const book = JSON.parse(fs.readFileSync(bookFile, 'utf8'))
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const plain = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/\{+\s*([^{}]*?)\s*\}+/g, ' $1 ')
  .toLowerCase()
const words = (s) => plain(s).replace(/[^a-z0-9+\- ]+/g, ' ').split(/\s+/).filter(Boolean)
const sameName = (a, b) => words(a).join(' ') === words(b).join(' ')
const sameText = (a, b) => words(a).join(' ') === words(b).join(' ')
const blank = (v) => (v == null || v === '' || v === '-' ? null : String(v).replace(/"/g, '').trim())
const icon = (s) => (s ? plain(s).trim() : null)

async function search(endpoint, name) {
  const q = name.replace(/[“”"]/g, '').replace(/[‘’]/g, "'")
  const cacheKey = `${endpoint}:${q}`
  if (cache[cacheKey]) return cache[cacheKey]
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(`${UPSTREAM}/${endpoint}?search=${encodeURIComponent(q)}&per_page=100`, {
      headers: { Accept: 'application/json', 'User-Agent': 'HodgepodgeHearthside book-sources' },
    })
    if (res.status === 429) { await sleep(20000); continue }
    if (!res.ok) throw new Error(`${endpoint} ${q}: ${res.status}`)
    const json = await res.json()
    cache[cacheKey] = (json.data || []).filter((d) => sameName(d.name, name))
    fs.writeFileSync(cacheFile, JSON.stringify(cache))
    await sleep(2100)
    return cache[cacheKey]
  }
  throw new Error(`${endpoint} ${q}: rate limited six times running`)
}

const DEFENCE = { physical_defense: 'fortitude', magical_defense: 'warding', unusual_defense: 'unusual' }
const HAS_TRIGGER = /\{\{(crow|mask|ram|tome|stone)\}\}\s*[^:]{1,40}:/

/** Does this register record say what the book says? Returns a reason when not. */
function differs(entry, rec) {
  if (entry.kind === 'action') {
    if (HAS_TRIGGER.test(entry.description)) return 'the book writes a trigger into it'
    const pairs = [
      ['range', entry.range, rec.range],
      ['Skl', (entry.stat || '').replace(/\{\{.*$/, ''), rec.stat],
      ['resist', entry.resistedBy, rec.resisted_by],
      ['TN', entry.targetNumber, rec.target_number],
      ['Dmg', entry.damage, rec.damage],
    ]
    for (const [label, a, b] of pairs) {
      if (blank(a) !== blank(b)) return `${label} ${blank(a)} vs ${blank(b)}`
    }
  }
  if (entry.kind === 'trigger') {
    const want = icon(entry.suits)
    const have = icon(rec.suits)
    const stoneOk = want === 'stone' && (rec.stone_cost > 0 || have === 'stone')
    if (want !== have && !stoneOk) return `suit ${want} vs ${have}`
  }
  if (entry.kind === 'ability') {
    const want = icon(entry.suits)
    const have = DEFENCE[rec.defensive_ability_type] || null
    if (want !== have) return `defence ${want} vs ${have}`
  }
  if (!sameText(entry.description, rec.description)) return 'the text differs'
  return null
}

const ENDPOINT = { action: 'actions', trigger: 'triggers', ability: 'abilities' }
const sources = {}
const nearMisses = []

async function consider(key, entry) {
  const endpoint = ENDPOINT[entry.kind]
  if (!endpoint) return
  const found = await search(endpoint, entry.name)
  const reasons = []
  for (const rec of found) {
    const why = differs(entry, rec)
    if (!why) {
      sources[key] = { from: endpoint, slug: rec.slug }
      return
    }
    reasons.push(why)
  }
  if (reasons.length) nearMisses.push(`${key}: ${[...new Set(reasons)].join('; ')}`)
}

const keys = Object.keys(book).filter((k) => k.startsWith('advancement:') && !k.endsWith('::page')).sort()
for (const key of keys) {
  const raw = book[key]
  if (typeof raw !== 'string' || !raw.startsWith('{')) continue
  const entry = JSON.parse(raw)
  if (entry.kind === 'totem') {
    for (const a of entry.abilities || []) await consider(`${key}|ability:${a.name}`, a)
    for (const a of entry.actions || []) await consider(`${key}|action:${a.name}`, a)
  } else {
    await consider(key, entry)
  }
}

const lines = Object.keys(sources).sort().map((k) => (
  `  ${JSON.stringify(k)}: { from: ${JSON.stringify(sources[k].from)}, slug: ${JSON.stringify(sources[k].slug)} },`
))
fs.writeFileSync(outFile, `/**
 * Book entries that BiggerHat carries word for word, and where.
 *
 * Generated by \`scripts/book-sources.mjs\` — do not edit by hand; re-run it.
 * Read by \`lib/book.js\`: a key here is fetched live from the register, like
 * card text (§4), instead of from \`book_text\`. Identifiers only, never text.
 *
 * A totem's own abilities and actions are keyed \`<totem key>|<kind>:<name>\`.
 */
export const BOOK_SOURCES = {
${lines.join('\n')}
}
`)

console.log(`${Object.keys(sources).length} entries read from BiggerHat; written to ${path.relative(root, outFile)}.`)
if (nearMisses.length) {
  console.log(`\n${nearMisses.length} share a name with a register entry but not its rules, so stay on the book:`)
  for (const m of nearMisses) console.log(`  ${m}`)
}
