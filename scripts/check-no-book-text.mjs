#!/usr/bin/env node
/**
 * Refuse to build a bundle that would publish the campaign book's text.
 *
 * **`public/` is served.** Everything in it is copied into `dist/` and put at a
 * public URL by Cloudflare Pages — that is how `manifest.webmanifest` and the
 * art get there, and it is why CLAUDE.md already lists the 1.9 MB Hank master
 * as a known issue: nothing requests it and Cloudflare serves it anyway.
 *
 * So `public/book.json` filled in and deployed would be the whole of *Index of
 * the Untold*'s rules text at one unauthenticated URL, in JSON, ready to be
 * fetched in a single request. That is the most scrapeable shape the text could
 * possibly take — worse than committing it, because it needs no clone and no
 * search, just a GET.
 *
 * `.gitignore` alone does not prevent this. It stops the file reaching the
 * repository, and therefore Cloudflare's build — but it does not stop somebody
 * removing that line, running `git add -f`, or building locally and uploading
 * `dist/`. This does, and it says why at the moment it matters.
 *
 * The scaffold with empty values is fine and passes: it carries no text.
 *
 * If the owner clears publication with Wyrd, set `ALLOW_BOOK_TEXT=1`. That is
 * deliberately an explicit act with a name, rather than the absence of one.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'public', 'book.json')

if (process.env.ALLOW_BOOK_TEXT === '1') {
  console.log('ALLOW_BOOK_TEXT=1 — publishing the book text on purpose.')
  process.exit(0)
}

if (!fs.existsSync(target)) process.exit(0)

let book
try {
  book = JSON.parse(fs.readFileSync(target, 'utf8'))
} catch {
  console.error(`public/book.json is not valid JSON. Fix it or delete it.`)
  process.exit(1)
}

const filled = Object.entries(book)
  .filter(([key, value]) => !key.endsWith('::page') && typeof value === 'string' && value.trim())

if (filled.length === 0) process.exit(0)

console.error('')
console.error('  BUILD STOPPED — public/book.json holds the campaign book\'s text.')
console.error('')
console.error(`  ${filled.length} filled ${filled.length === 1 ? 'entry' : 'entries'}. Everything in public/ is served at a`)
console.error('  public URL, so this bundle would put Wyrd\'s rules text one')
console.error('  unauthenticated GET away — the easiest possible thing to scrape.')
console.error('')
console.error('  The file is meant to stay on your machine for `npm run dev`.')
console.error('')
console.error('  To build anyway, having cleared it with Wyrd:  ALLOW_BOOK_TEXT=1 npm run build')
console.error('')
process.exit(1)
