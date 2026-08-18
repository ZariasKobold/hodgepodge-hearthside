#!/usr/bin/env node
/**
 * Builds a local register file so the app can run without the network.
 *
 * Two reasons you might want this: the production build has no dev proxy to
 * hide behind, and a seeded file means the app keeps working if the upstream
 * register is down.
 *
 * Read before running:
 *   - This is someone's donation-funded community project. Ask before you
 *     point a seed run at it, and don't schedule this on a cron.
 *   - The index endpoint returns no actions, so anything that could be a
 *     selection source needs a second request. That is the slow part, and why
 *     the app itself loads per-keyword on demand instead of seeding by default.
 *   - Only identifiers are written out. Every description is discarded.
 */
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../public/register.json')

const UPSTREAM = process.env.VITE_REGISTRY_UPSTREAM || 'https://biggerhat.net'
const BASE = `${UPSTREAM.replace(/\/$/, '')}/api/v1`
const GAP_MS = Number(process.env.SEED_GAP_MS || 200)
const CONCURRENCY = Number(process.env.SEED_CONCURRENCY || 2)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function get(path) {
  const res = await fetch(BASE + path, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${res.status} on ${path}`)
  return res.json()
}

async function allPages(path) {
  const rows = []
  let page = 1
  let lastPage = 1
  do {
    const joiner = path.includes('?') ? '&' : '?'
    const body = await get(`${path}${joiner}page=${page}`)
    rows.push(...(body.data || []))
    lastPage = body.meta?.last_page ?? 1
    process.stdout.write(`\r  ${path} — page ${page}/${lastPage}`)
    page += 1
    if (page <= lastPage) await sleep(GAP_MS)
  } while (page <= lastPage)
  process.stdout.write('\n')
  return rows
}

const strip = (c) => ({
  slug: c.slug,
  name: c.display_name || c.name,
  cost: c.cost,
  faction: c.faction,
  secondFaction: c.second_faction || null,
  station: c.station || null,
  keywords: (c.keywords || []).map((k) => k.slug),
  keywordNames: (c.keywords || []).map((k) => k.name),
  characteristics: c.characteristics || [],
  isUnhirable: Boolean(c.is_unhirable),
  isBeta: Boolean(c.is_beta),
  hasTotem: c.has_totem_id != null,
  totemSlug: c.totem_slug || null,
  actions: (c.actions || []).map((a) => ({
    name: a.name,
    slug: a.slug,
    type: a.type,
    triggers: (a.triggers || []).map((t) => t.name),
  })),
  abilities: (c.abilities || []).map((a) => a.name),
  hasDetail: Array.isArray(c.actions),
})

async function main() {
  console.log(`Seeding from ${BASE}`)
  console.log('Reading the character index…')
  const index = await allPages('/characters')

  // Only models that could ever be a selection source need their detail pulled.
  const wanted = index
    .map(strip)
    .filter((m) => m.cost != null && m.cost > 0 && !m.isUnhirable && !m.isBeta)

  console.log(`${index.length} records, ${wanted.length} eligible as selection sources.`)
  console.log('Pulling details…')

  const detailed = []
  for (let i = 0; i < wanted.length; i += CONCURRENCY) {
    const batch = wanted.slice(i, i + CONCURRENCY)
    const results = await Promise.all(
      batch.map(async (m) => {
        try {
          const body = await get(`/characters/${encodeURIComponent(m.slug)}`)
          return strip(body.data)
        } catch (err) {
          console.warn(`\n  skipped ${m.slug}: ${err.message}`)
          return m
        }
      })
    )
    detailed.push(...results)
    process.stdout.write(`\r  ${detailed.length}/${wanted.length}`)
    if (i + CONCURRENCY < wanted.length) await sleep(GAP_MS)
  }
  process.stdout.write('\n')

  const payload = {
    generatedAt: new Date().toISOString(),
    source: UPSTREAM,
    count: detailed.length,
    models: detailed,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload))
  console.log(`Wrote ${detailed.length} models to public/register.json`)
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`)
  process.exitCode = 1
})
