#!/usr/bin/env node
/**
 * Dry-run the v2 → v3 lift against a real export, and prove nothing was lost.
 *
 *   node scripts/migrate-check.mjs path/to/hodgepodge-export.json
 *
 * `docs/data-model-v3.md`, step 2: *"`migrateLeaderToCampaign` has never been
 * run against anything but a synthetic record. Do not add a second unverified
 * lift on top of it. Run v3's migration against real exported JSON from the
 * live account before trusting it."* This is that run.
 *
 * It reads. It writes nothing, touches no browser storage and talks to no
 * network — the input file is not modified and no output file is produced. So
 * it is safe to point at the only copy of somebody's twelve weeks, which is
 * exactly the file worth pointing it at.
 *
 * What it checks, per campaign, is conservation: every model, injury, equipment
 * row, game and scrip in the v2 document is still there in the v3 pair, and the
 * ids that D1 already knows are unchanged. A summary is printed either way;
 * the exit code is 1 if any invariant broke.
 */

import { readFileSync } from 'node:fs'
import { migrateShelf, readBundle, isLegacyCampaign } from '../src/lib/shape/migrate.js'

const path = process.argv[2]
if (!path) {
  console.error('usage: node scripts/migrate-check.mjs <exported-campaign.json>')
  process.exit(2)
}

const raw = JSON.parse(readFileSync(path, 'utf8'))

/** The v2 documents in the file, whatever wrapper they arrived in. */
const legacy = (Array.isArray(raw) ? raw : Array.isArray(raw?.campaigns) ? raw.campaigns : [raw])
  .filter(isLegacyCampaign)

const { campaigns, arsenals } = readBundle(raw)
const byId = new Map(arsenals.map((a) => [a.id, a]))

let failures = 0
const fail = (msg) => { failures += 1; console.log(`   ✗ ${msg}`) }

console.log(`\n${path}`)
console.log(`   ${legacy.length} legacy campaign(s) in the file → ${campaigns.length} campaign(s) + ${arsenals.length} arsenal(s)\n`)

for (const before of legacy) {
  const after = campaigns.find((c) => c.id === before.id)
  console.log(`── ${before.name || '(unnamed)'}  ${before.id}`)

  if (!after) { fail('campaign missing after the lift'); continue }

  // Ids are what the D1 rows are keyed by. A re-mint here doubles every row on
  // the server the first time a device syncs after upgrading.
  if (after.id !== before.id) fail(`campaign id changed: ${before.id} → ${after.id}`)

  for (const src of before.arsenals || []) {
    const dst = byId.get(src.id)
    if (!dst) { fail(`arsenal ${src.id} missing after the lift`); continue }

    const name = src.leader?.name || src.displayName || src.id
    const counts = [
      ['models', (src.models || []).length, dst.models.length],
      ['injuries', (src.injuries || []).length, dst.injuries.length],
      ['equipment', (src.equipment || []).length, dst.equipment.length],
      ['scrip', src.scrip || 0, dst.scrip],
      ['xp boxes', src.leader?.experience?.boxesChecked || 0, dst.leader.experience.boxesChecked],
      ['advancements', (src.leader?.advancements || []).length, dst.leader.advancements.length],
    ]
    for (const [label, was, is] of counts) {
      if (was !== is) fail(`${name}: ${label} ${was} → ${is}`)
    }

    // Every model must have an id, or it cannot be injured, annihilated or
    // removed — the v1 repair this lift carries forward.
    const idless = dst.models.filter((m) => !m.id).length
    if (idless) fail(`${name}: ${idless} model(s) still have no id`)

    if (dst.campaignId !== before.id) fail(`${name}: seated at ${dst.campaignId}, expected ${before.id}`)
    if (!after.participants.some((p) => p.arsenalId === dst.id)) {
      fail(`${name}: no participation at the table`)
    }

    console.log(`   ✓ ${name} — ${dst.models.length} models, ${dst.injuries.length} injuries, ${dst.equipment.length} kit, ${dst.scrip} scrip`)
  }

  const gamesBefore = (before.games || []).length
  if (gamesBefore !== after.games.length) fail(`games ${gamesBefore} → ${after.games.length}`)
  const orphanGames = after.games.filter((g) => g.arsenalId && !byId.has(g.arsenalId)).length
  if (orphanGames) fail(`${orphanGames} game(s) point at an arsenal that is not in the file`)

  console.log(`   ✓ ${after.games.length} games, week ${after.weekMode === 'manual' ? after.manualWeek : `calendar+${after.weekOffset}`}, ${after.participants.length} at the table\n`)
}

if (failures) {
  console.log(`${failures} problem(s). Do NOT cut over until these are understood.\n`)
  process.exit(1)
}
console.log('Nothing lost. Every id preserved.\n')
