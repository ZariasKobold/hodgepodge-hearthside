#!/usr/bin/env node
/**
 * Write the empty scaffold for `public/book.json`.
 *
 * Every advancement row, every piece of equipment and every injury gets a key
 * with an empty string beside it, in reading order with the page number in a
 * comment field. Filling it in is typing values from the book you own; you
 * never have to work out a key or worry about the three "Skill Boost" rows.
 *
 *   node scripts/book-template.mjs
 *
 * **It will not overwrite an existing file** — pass --force if you really mean
 * to, and expect to lose whatever you had typed. It writes to `public/`, which
 * is gitignored for `book.json`, so the text stays on your machine. See
 * `src/lib/book.js` for why.
 *
 * Run it again after a data file gains rows: it merges, keeping every value you
 * have already written and adding only the keys that are new.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'public', 'book.json')
const force = process.argv.includes('--force')

const load = async (rel) => import(pathToFileURL(path.join(root, rel)).href)

const { ADVANCEMENT_TABLES } = await load('src/data/advancements.js')
const { BARTER, THIRST } = await load('src/data/equipment.js')
const injuries = await load('src/data/injuries.js')

const { advancementKey, equipmentKey, injuryKey } = await load('src/lib/book.js')

/** Existing values survive; only missing keys are added. */
let existing = {}
if (fs.existsSync(target)) {
  if (!force) {
    try {
      existing = JSON.parse(fs.readFileSync(target, 'utf8'))
    } catch {
      console.error(`${target} exists and is not valid JSON. Fix it or pass --force.`)
      process.exit(1)
    }
  }
}

const out = {}
let added = 0
const put = (key, note) => {
  if (!key) return
  if (key in existing) { out[key] = existing[key]; return }
  out[key] = ''
  added += 1
  if (note) out[`${key}::page`] = note
}

for (const table of ADVANCEMENT_TABLES) {
  for (const entry of table.entries || []) {
    put(advancementKey(table.id, entry), entry.page ? `p.${entry.page}` : null)
  }
}

for (const item of [...(BARTER || []), ...(THIRST || [])]) {
  put(equipmentKey(item.id), item.page ? `p.${item.page}` : null)
}

// Every upgrade the injury chart can attach, once each, keyed by name. The
// chart's rows carry no id, so this used to look for one and write nothing
// (audit v0.28.1 L5). Lucky Miss results are not injuries and are not keyed.
for (const row of injuries.INJURY_TABLE) {
  if (row.injury) put(injuryKey(row.name), row.page ? `p.${row.page}` : null)
}

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`)

const filled = Object.keys(out).filter((k) => !k.endsWith('::page') && out[k]).length
const total = Object.keys(out).filter((k) => !k.endsWith('::page')).length

console.log(`Wrote ${target}`)
console.log(`  ${total} entries, ${filled} already filled in, ${added} new.`)
console.log('')
console.log('This file is gitignored on purpose — it is the book\'s text, and')
console.log('the book is Wyrd\'s to distribute. Keep it on your machine.')
