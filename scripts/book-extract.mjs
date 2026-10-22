#!/usr/bin/env node
/**
 * Read the leader advancement tables out of the owner's copy of the book and
 * merge them into `book/book.json`.
 *
 *   node scripts/book-extract.mjs [path/to/Index_of_the_Untold.pdf]
 *
 * The parsing is `scripts/book-extract.py` (PyMuPDF, because the suit and range
 * symbols are only distinguishable by font). This script feeds it every row of
 * `src/data/advancements.js`, so the keys are exactly the ones `lib/book.js`
 * builds, and writes each entry as a JSON string: the value `book_text.text`
 * holds and `lib/book.js` parses.
 *
 * Every row it reads replaces what was there; anything it does not produce
 * (equipment, injuries, hand-typed entries) is kept. A row the parser was not
 * sure of is reported and left out, never guessed at.
 *
 * `book/` is gitignored. Next: `node scripts/book-sources.mjs`, then
 * `node scripts/book-to-sql.mjs > book.sql`.
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pdf = process.argv[2] || path.join(root, 'docs', 'Index_of_the_Untold.pdf')
const target = path.join(root, 'book', 'book.json')

if (!fs.existsSync(pdf)) {
  console.error(`No book at ${pdf}.`)
  process.exit(1)
}

const { ADVANCEMENT_TABLES } = await import(pathToFileURL(path.join(root, 'src/data/advancements.js')).href)
const entries = ADVANCEMENT_TABLES.flatMap((t) => (t.entries || []).map((e) => ({
  table: t.id, value: e.value, name: e.name, page: e.page, type: e.type,
})))

const python = process.platform === 'win32' ? 'python' : 'python3'
const run = spawnSync(python, ['-X', 'utf8', path.join(root, 'scripts', 'book-extract.py'), pdf], {
  input: JSON.stringify(entries), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
})
if (run.status !== 0) {
  console.error(run.stderr || run.error?.message || 'book-extract.py failed')
  process.exit(1)
}
if (run.stderr.trim()) {
  console.error('Rows left out, the parser was not sure of them:')
  console.error(run.stderr.trim().split('\n').map((l) => `  ${l}`).join('\n'))
}

const read = JSON.parse(run.stdout)
let existing = {}
if (fs.existsSync(target)) existing = JSON.parse(fs.readFileSync(target, 'utf8'))

const out = { ...existing }
for (const [key, entry] of Object.entries(read)) out[key] = JSON.stringify(entry)

fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`)
console.log(`Wrote ${Object.keys(read).length} of ${entries.length} advancement rows to ${path.relative(root, target)}.`)
