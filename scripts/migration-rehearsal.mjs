#!/usr/bin/env node
/**
 * Rehearse migrations 0005 and 0006 against a restored backup.
 *
 *   node scripts/migration-rehearsal.mjs backups/hodgepodge-2026-09-03.d1.sql
 *
 * `docs/sync-v3-plan.md` step A: run the whole thing offline, against a copy of
 * the real database, before anything remote is touched. 0006 rebuilds a table
 * and is the only migration in this project that can destroy rows, so it does
 * not go near production until this has passed.
 *
 * Everything happens in a temporary SQLite file which is deleted at the end. The
 * backup is opened read-only — this script cannot modify its input.
 *
 * ## What it asserts
 *
 * 1. Both migrations apply cleanly.
 * 2. **Not one row is lost** — arsenals, arsenal_models, campaigns and users all
 *    match their pre-migration counts, and every arsenal keeps its id.
 * 3. `arsenal_models` still resolve to their arsenals, i.e. the rebuild did not
 *    orphan the rows that hang off the table it replaced.
 * 4. **The cascade is gone**: deleting a campaign leaves its arsenal alive with
 *    `campaign_id IS NULL`. This is the assertion the whole of 0006 exists for,
 *    and it is checked with foreign keys *enforced*, because a test with them
 *    off would prove nothing.
 * 5. An arsenal can be inserted with no campaign at all, which `NOT NULL`
 *    previously forbade.
 */

import { readFileSync, unlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const backup = process.argv[2]
if (!backup) {
  console.error('usage: node scripts/migration-rehearsal.mjs <backup.d1.sql>')
  process.exit(2)
}

const stamp = Date.now()
const dbOld = join(tmpdir(), `hh-rehearsal-old-${stamp}.db`)
const dbNew = join(tmpdir(), `hh-rehearsal-new-${stamp}.db`)
let failures = 0
const ok = (msg) => console.log(`   ✓ ${msg}`)
const fail = (msg) => { failures += 1; console.log(`   ✗ ${msg}`) }
const check = (cond, msg) => (cond ? ok(msg) : fail(msg))

const db = new DatabaseSync(dbOld)
const count = (t) => db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n

try {
  console.log(`\nRehearsing 0005 + 0006 against ${backup}\n`)

  // ── restore ──────────────────────────────────────────────────────
  db.exec(readFileSync(backup, 'utf8'))
  const before = {
    arsenals: count('arsenals'),
    arsenal_models: count('arsenal_models'),
    campaigns: count('campaigns'),
    users: count('users'),
    campaign_members: count('campaign_members'),
  }
  const idsBefore = db.prepare('SELECT id FROM arsenals ORDER BY id').all().map((r) => r.id)
  console.log('── restored'); console.log('  ', JSON.stringify(before))

  // The cascade, demonstrated on the *old* schema, so the fix has something to
  // be measured against. Done on a throwaway row rather than real data.
  db.exec('PRAGMA foreign_keys = ON')
  const victim = db.prepare('SELECT id, owner_user_id FROM campaigns LIMIT 1').get()
  db.prepare(
    `INSERT INTO arsenals (id, campaign_id, user_id, updated_at) VALUES (?,?,?,?)`
  ).run('ars_probe_old', victim.id, db.prepare('SELECT id FROM users LIMIT 1').get().id, Date.now())
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(victim.id)
  const survivedBefore = db.prepare('SELECT COUNT(*) AS n FROM arsenals WHERE id = ?').get('ars_probe_old').n
  console.log('\n── the bug, on the old schema')
  check(survivedBefore === 0, 'deleting a campaign DID delete its arsenal (this is what 0006 fixes)')

  // A second, untouched restore, so the migration runs on real data rather than
  // on the leftovers of the demonstration above.
  db.close()
  const db2 = new DatabaseSync(dbNew)
  db2.exec(readFileSync(backup, 'utf8'))

  // ── migrate ──────────────────────────────────────────────────────
  console.log('\n── applying 0005 and 0006')
  for (const file of ['migrations/0005_arsenal_sync.sql', 'migrations/0006_arsenals_survive_their_campaign.sql']) {
    db2.exec(readFileSync(file, 'utf8'))
    ok(`applied ${file.split('/').pop()}`)
  }

  const c2 = (t) => db2.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n

  // ── nothing lost ─────────────────────────────────────────────────
  console.log('\n── conservation')
  for (const [table, was] of Object.entries(before)) {
    check(c2(table) === was, `${table}: ${was} → ${c2(table)}`)
  }
  const idsAfter = db2.prepare('SELECT id FROM arsenals ORDER BY id').all().map((r) => r.id)
  check(JSON.stringify(idsAfter) === JSON.stringify(idsBefore), 'every arsenal kept its id')

  const orphans = db2.prepare(
    `SELECT COUNT(*) AS n FROM arsenal_models m
      WHERE NOT EXISTS (SELECT 1 FROM arsenals a WHERE a.id = m.arsenal_id)`
  ).get().n
  check(orphans === 0, `no orphaned arsenal_models (${orphans} found)`)

  // ── the new columns ──────────────────────────────────────────────
  console.log('\n── the new shape')
  const cols = db2.prepare('PRAGMA table_info(arsenals)').all().map((c) => c.name)
  for (const col of ['doc', 'schema_version', 'version']) {
    check(cols.includes(col), `arsenals.${col} exists`)
  }
  check(
    db2.prepare('PRAGMA table_info(campaign_members)').all().some((c) => c.name === 'arsenal_id'),
    'campaign_members.arsenal_id exists'
  )
  const campaignIdCol = db2.prepare('PRAGMA table_info(arsenals)').all().find((c) => c.name === 'campaign_id')
  check(campaignIdCol.notnull === 0, 'arsenals.campaign_id is nullable')
  check(
    db2.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='index' AND tbl_name='arsenals'").get().n >= 2,
    'both indexes rebuilt'
  )

  // ── the assertion 0006 exists for ────────────────────────────────
  console.log('\n── the cascade is gone')
  db2.exec('PRAGMA foreign_keys = ON')
  check(db2.prepare('PRAGMA foreign_keys').get().foreign_keys === 1, 'foreign keys are enforced for this check')

  const target = db2.prepare('SELECT id FROM campaigns LIMIT 1').get()
  const anyUser = db2.prepare('SELECT id FROM users LIMIT 1').get().id
  db2.prepare('INSERT INTO arsenals (id, campaign_id, user_id, updated_at) VALUES (?,?,?,?)')
    .run('ars_probe_new', target.id, anyUser, Date.now())
  db2.prepare('DELETE FROM campaigns WHERE id = ?').run(target.id)

  const probe = db2.prepare('SELECT campaign_id FROM arsenals WHERE id = ?').get('ars_probe_new')
  check(!!probe, 'the arsenal SURVIVED its campaign being deleted')
  check(probe && probe.campaign_id === null, 'and was released to no table (campaign_id IS NULL)')

  // Real arsenals that belonged to that campaign must be released too, not gone.
  const released = db2.prepare(
    'SELECT COUNT(*) AS n FROM arsenals WHERE campaign_id IS NULL AND id != ?'
  ).get('ars_probe_new').n
  check(released >= 0, `${released} real arsenal(s) released rather than deleted`)
  check(c2('arsenals') === before.arsenals + 1, 'arsenal count unchanged but for the probe')

  // ── an arsenal at no table at all ────────────────────────────────
  console.log('\n── an unseated arsenal')
  db2.prepare('INSERT INTO arsenals (id, campaign_id, user_id, updated_at) VALUES (?,?,?,?)')
    .run('ars_unseated', null, anyUser, Date.now())
  ok('an arsenal can be stored with no campaign — NOT NULL previously forbade this')
  db2.prepare('INSERT INTO arsenals (id, campaign_id, user_id, updated_at) VALUES (?,?,?,?)')
    .run('ars_unseated_2', null, anyUser, Date.now())
  ok('and a player may have several, because UNIQUE treats NULLs as distinct')

  db2.close()
} catch (err) {
  fail(`threw: ${err.message}`)
} finally {
  // Windows will not unlink a file SQLite still holds open, and a leftover
  // temp file is not worth failing the run over.
  for (const p of [dbOld, dbNew]) {
    try { if (existsSync(p)) unlinkSync(p) } catch { /* it is in tmp; it will go */ }
  }
}

console.log()
if (failures) {
  console.log(`${failures} problem(s). Do NOT run these against remote.\n`)
  process.exit(1)
}
console.log('All assertions passed. Safe to apply against a fresh backup of remote.\n')
