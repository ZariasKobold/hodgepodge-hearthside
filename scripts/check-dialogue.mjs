#!/usr/bin/env node
/**
 * Do `src/data/hank.js` and `docs/hank-dialogue.md` still agree?
 *
 *   node scripts/check-dialogue.mjs
 *
 * CLAUDE.md §1 keeps Hank's lines in two files by hand, and §5's dialogue
 * audit asks whether they still match. Until now that check depended on
 * whoever ran it inventing a correct regex, and twice somebody did not: the
 * v0.5.2 audit's M6 was a false positive, and the v0.21.1 audit's first two
 * attempts reported 241 false mismatches. Its three traps are why this script
 * is written the way it is:
 *
 *   1. **Codes are not one shape.** `S-04`, `BA-07`, `H1-01`, `AD-F`,
 *      `C-01 · Identity`. So this never parses the codes. It reads every
 *      `> "…"` quote line in the doc, which is the one thing every entry shares.
 *   2. **The repo is CRLF**, so `"$` never matches. Lines are split on
 *      `\r?\n` and trimmed.
 *   3. **The code's strings carry their own quote marks.** Both sides are
 *      compared as written, quotes included, after trimming.
 *
 * The code side is read by importing the module and walking every export, not
 * by scanning source text, so a string is counted exactly as the app holds it.
 *
 * Exits 1 on any disagreement, and on a count line that does not match the
 * number of lines. Read-only.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const docPath = join(root, 'docs', 'hank-dialogue.md')
const codePath = join(root, 'src', 'data', 'hank.js')

/** Strings in the code that are not dialogue. Keep this list short and named. */
const NOT_DIALOGUE = new Set(['hank:enabled'])

const clean = (s) => s.replace(/\r/g, '').trim()

/** Every quote line in the doc, in order, without the leading `> `. */
export function docLines(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith('> '))
    .map((line) => clean(line.slice(2)))
}

/** The `= N lines` total on the doc's counts line, or null. */
export function docCount(text) {
  const m = text.match(/\*\*Counts:\*\*.*?=\s*(\d+)\s+lines/)
  return m ? Number(m[1]) : null
}

/** Every string reachable from the module's exports, deduplicated. */
export function codeLines(mod) {
  const out = new Set()
  const seen = new Set()
  const walk = (v) => {
    if (typeof v === 'string') {
      const s = clean(v)
      if (s && !NOT_DIALOGUE.has(s)) out.add(s)
      return
    }
    if (!v || typeof v !== 'object' || seen.has(v)) return
    seen.add(v)
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x)
  }
  for (const v of Object.values(mod)) walk(v)
  return out
}

export function compare(doc, code) {
  const docSet = new Set(doc)
  return {
    onlyInDoc: doc.filter((l) => !code.has(l)),
    onlyInCode: [...code].filter((l) => !docSet.has(l)),
    duplicatesInDoc: doc.filter((l, i) => doc.indexOf(l) !== i),
  }
}

async function main() {
  const text = readFileSync(docPath, 'utf8')
  const doc = docLines(text)
  const code = codeLines(await import(pathToFileURL(codePath).href))
  const { onlyInDoc, onlyInCode, duplicatesInDoc } = compare(doc, code)
  const stated = docCount(text)

  const short = (l) => (l.length > 90 ? `${l.slice(0, 87)}...` : l)
  let bad = false
  if (onlyInDoc.length) {
    bad = true
    console.log(`\nIn the doc, not in hank.js (${onlyInDoc.length}):`)
    for (const l of onlyInDoc) console.log(`  ${short(l)}`)
  }
  if (onlyInCode.length) {
    bad = true
    console.log(`\nIn hank.js, not in the doc (${onlyInCode.length}):`)
    for (const l of onlyInCode) console.log(`  ${short(l)}`)
  }
  if (duplicatesInDoc.length) {
    bad = true
    console.log(`\nIn the doc twice (${duplicatesInDoc.length}):`)
    for (const l of duplicatesInDoc) console.log(`  ${short(l)}`)
  }
  if (stated !== doc.length) {
    bad = true
    console.log(`\nThe doc's counts line says ${stated ?? 'nothing'}; it holds ${doc.length} lines.`)
  }

  if (bad) {
    console.log('\nThe two files disagree. Fix both in the same change (CLAUDE.md §1).')
    process.exit(1)
  }
  console.log(`hank.js and hank-dialogue.md agree: ${doc.length} lines, and the counts line says so.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main()
