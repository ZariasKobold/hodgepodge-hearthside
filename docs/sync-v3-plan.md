# Steps 4 and 5 — the schema, the sync, and not losing anybody's campaign

Companion to `docs/data-model-v3.md`, which covers steps 1–3 (done). This covers
what is left, and it is the dangerous half: steps 1–3 only ever wrote to the
device in front of you, and these two write to a database five people share.

Status: **steps A–D done. E, F and G outstanding.** Written 2026-09-03 at
v0.19.4; the conflict screen it calls for landed at v0.20.0, and migrations 0005
and 0006 were applied to remote the same day.

**The schema is now ready for arsenals to sync. The code is not** — `useSync`
still only knows about campaigns, `putCampaign` still reaches for
`campaign.arsenals[0]`, and there is no `arsenalStore.js`. `SYNC_DISABLED` stays
true until step E.

---

## Where things actually stand, checked rather than remembered

**On the server**, as of the 2026-09-03 backup:

- 6 campaigns. `doc` holds a **v2** document — the leader nested inside.
  `schema_version = 2`. Versions are **9, 5, 0, 0, 0, 0** — the two non-zero
  ones are the owner's own campaigns, the pair that actually synced across a
  phone and a computer. An earlier draft of this document said "version 0 on
  every single row", which was read off a truncated query and was wrong; the
  correction matters, and is spelled out under step F.
- 6 `arsenals` rows, which are a **projection, not a document**: faction,
  keywords, scrip, `leader` JSON, `crew_card`, `total_cost`, `injuries`,
  `equipment`, `totem`. No `doc` column. Lossy — it has no `crewCardAdvancements`,
  no `displayName`, no `startingScripGranted`.
- 23 `arsenal_models` rows. `injuries`, `equipment` and `games` tables are
  **empty** and always have been; that data lives only inside `doc`.
- `campaign_members` has no `arsenal_id`.

**The `arsenals` table, verbatim, is the problem:**

```sql
CREATE TABLE arsenals (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  ...
  UNIQUE (campaign_id, user_id)
);
```

Three things in that definition contradict v3 outright: `NOT NULL` forbids an
arsenal that is not at a table, `ON DELETE CASCADE` **deletes an arsenal when its
campaign goes**, and there is no `version` column so an arsenal cannot take part
in the optimistic-concurrency scheme that `campaigns` got in 0004.

**On every client**: v3, sync off, with the pre-cutover v2 document parked at
`v2-backup:campaign:<id>`.

---

## The four ways this loses data

Naming them first, because each countermeasure below exists for one of them.

### T1 — a v3 campaign pushed to a v2 server row

`putCampaign` reads the arsenal out of the campaign: `campaign.arsenals?.[0]`.
In v3 that is `undefined`, so the whole arsenal branch is skipped. The push would
write a campaign `doc` **containing no leader, no models, no scrip and no
injuries**, and leave the `arsenals` projection untouched and now stale. The
player's arsenal would exist only on that one device.

This is the specific reason `SYNC_DISABLED` exists.

### T2 — the cascade

`ON DELETE CASCADE` from `campaigns` to `arsenals`. In v2 that was right: the
arsenal *was* part of the campaign. In v3 it is exactly backwards — open question
3 says an arsenal survives its campaign with `campaignId: null`. Deleting a
campaign server-side would delete a player's leader.

Whether D1 enforces the FK at all is **not something to assume**; prove it with a
delete against a local restore before relying on either answer.

### T3 — a stale client

Someone with a tab open from before the cutover pulls a v3 document, cannot read
it, and pushes back something degraded. The service-worker fix (v0.19.3/4) makes
this much less likely, but "less likely" is not a guarantee against a phone left
open for a week.

### T4 — the migration itself

A table rebuild is the one operation here that can destroy six rows in a single
statement, and unlike everything else in this project it cannot be unit-tested
against the thing it will actually run on.

---

## Step 4 — the schema

Two migrations, not one, because they are different risk classes and the second
should be applied and verified on its own.

### Migration 0005 — additive only, therefore safe

```sql
-- The arsenal becomes a document in its own right, not merely a projection.
-- Nullable on purpose: NULL means "no v3 client has ever written this row",
-- which is a different fact from "{}" and is the one the sync code needs.
ALTER TABLE arsenals ADD COLUMN doc TEXT;
ALTER TABLE arsenals ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 0;

-- The same server-assigned counter campaigns got in 0004, for the same reason
-- and with the same DEFAULT 0 trick: no client has ever been handed 0, so the
-- first write from any device is refused until it has pulled once.
ALTER TABLE arsenals ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- The participation gains the arsenal its player brought.
ALTER TABLE campaign_members ADD COLUMN arsenal_id TEXT REFERENCES arsenals(id);

-- Listing a player's arsenals is one query scoped by owner. Without RLS this
-- WHERE clause *is* the access control, so it is indexed and never optional.
CREATE INDEX IF NOT EXISTS idx_arsenals_user ON arsenals (user_id, updated_at DESC);
```

`doc` beside the projection columns, for the reason 0002 gave and 0003 repeated:
**`doc` is the source of truth, the columns are what other people are allowed to
read.** The shared page reads columns and never `doc`, and that separation is the
privacy boundary as much as it is a schema. Adding `doc` does not change it.

### Migration 0006 — the rebuild, and the only genuinely dangerous statement

SQLite cannot drop a `NOT NULL`, and cannot change a foreign key's delete action,
without rebuilding the table. This is the "much bigger conversation" the plan
anticipated. It is unavoidable: T2 is a live data-loss path and cannot be papered
over from the application side.

```sql
PRAGMA foreign_keys = OFF;

CREATE TABLE arsenals_new (
  id             TEXT PRIMARY KEY,
  -- Nullable, and SET NULL rather than CASCADE. This one line is the whole
  -- migration: an arsenal outliving its table is the point of v3.
  campaign_id    TEXT REFERENCES campaigns(id) ON DELETE SET NULL,
  user_id        TEXT NOT NULL REFERENCES users(id),
  faction        TEXT NOT NULL DEFAULT '',
  keyword_a      TEXT NOT NULL DEFAULT '',
  keyword_b      TEXT NOT NULL DEFAULT '',
  scrip          INTEGER NOT NULL DEFAULT 0,
  leader         TEXT NOT NULL DEFAULT '{}',
  crew_card      TEXT NOT NULL DEFAULT '{}',
  total_cost     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  injuries       TEXT NOT NULL DEFAULT '[]',
  equipment      TEXT NOT NULL DEFAULT '[]',
  totem          TEXT,
  doc            TEXT,
  schema_version INTEGER NOT NULL DEFAULT 0,
  version        INTEGER NOT NULL DEFAULT 0,
  -- Kept. It still says "one arsenal per player per table", and SQLite treats
  -- NULLs as distinct in a UNIQUE, so any number of *unseated* arsenals per
  -- player is allowed — which is what the shelf needs.
  UNIQUE (campaign_id, user_id)
);

INSERT INTO arsenals_new
  SELECT id, campaign_id, user_id, faction, keyword_a, keyword_b, scrip,
         leader, crew_card, total_cost, updated_at, injuries, equipment, totem,
         doc, schema_version, version
    FROM arsenals;

DROP TABLE arsenals;
ALTER TABLE arsenals_new RENAME TO arsenals;

CREATE INDEX idx_arsenals_campaign ON arsenals (campaign_id);
CREATE INDEX idx_arsenals_user     ON arsenals (user_id, updated_at DESC);

PRAGMA foreign_keys = ON;
```

**Do not run this without doing all of the following, in order:**

1. Take a fresh backup and **restore it** into a throwaway database. A backup
   nobody has restored is not a backup.
2. Run 0005 and 0006 against that restore. Assert `COUNT(*)` on `arsenals` and
   `arsenal_models` is identical before and after, and that every
   `arsenal_models.arsenal_id` still resolves.
3. On the restore, delete a campaign and prove its arsenal **survives** with
   `campaign_id IS NULL`. That is the assertion the whole rebuild exists for.
4. Only then run it against remote — and take another backup immediately first,
   because step 1's copy is now minutes old and this is the write that cannot be
   undone.

`arsenal_models.arsenal_id` references `arsenals(id)`, and dropping the table
with foreign keys off is what keeps those rows from being cascaded away
mid-rebuild. Turning them back on afterwards is not optional.

---

## Step 5 — generalising the sync

### The rule that shapes all of it

> Do not copy the sync machinery for a second object type. Two divergent copies
> of the code that can lose twelve weeks is the worst possible outcome of this
> change.

And a corollary that matters just as much: **`planSync` itself should barely
change.** It is pure, it is tested, and its four outcomes are correct for any
kind of versioned document. The right move is to parameterise its *inputs* and
call it once per kind — not to rewrite it to understand two kinds at once.

### Client

**`storage.js`** — the bookkeeping keys become kind-aware:

```
sync-version:<kind>:<id>      was campaign-version:<id>
sync-dirty:<kind>:<id>        was campaign-dirty:<id>
```

with a read-through that adopts the old key once and then forgets it, exactly as
`adoptLegacyCampaign` did. `saveArsenal` starts calling `markDirty('arsenal', id)`,
which it deliberately does not do today.

**`useSync`** — one reconcile, two kinds:

```js
const plans = {
  campaign: planSync(localCampaigns, remoteCampaigns, factsFor('campaign')),
  arsenal:  planSync(localArsenals,  remoteArsenals,  factsFor('arsenal')),
}
```

Ordering is not cosmetic — `arsenals.campaign_id` references `campaigns(id)`:

- **Push campaigns before arsenals.** An arsenal pushed first names a campaign
  row that does not exist yet.
- **Pull campaigns before arsenals**, so an arriving arsenal has a table to sit
  at locally.
- **Delete arsenals before campaigns**, the mirror of the same fact.

### Server

**`functions/lib/arsenalStore.js`**, written to `campaignStore.js`'s rules rather
than beside them:

- every exported function takes `userId` first;
- `requireSubject` throws rather than querying across everybody's rows;
- **one ownership gate before any write**, never a guard per statement — the
  `arsenal_models` hole in v0.7.0 is what that rule is made of;
- its own attack tests, in the shape of the existing 16.

**`/api/arsenals/[[path]].js`** mirroring the campaigns routes, same-origin
mutations, same `baseVersion` gate.

**One new server rule, cheap and worth it:**

> Refuse any write whose `schema_version` is **lower** than the row's stored
> `schema_version`.

That is T3 closed. A stale client cannot push a v2 document over a v3 row, and
the refusal is a 409 the client already knows how to handle.

### `putCampaign` has to stop reaching for the arsenal

`const arsenal = campaign.arsenals?.[0] || null` is v2's assumption. In v3 the
campaign has no arsenal, and the projection is written by the *arsenal's* own
endpoint instead. Until that changes, every campaign push silently stops
maintaining the shared page.

The membership read is unaffected in shape — it still selects from `arsenals`
`WHERE campaign_id IN (…)` — but it now depends on `campaign_id` being kept
current by the arsenal endpoint rather than the campaign one.

---

## The rollout, in the order that makes each step recoverable

**A. Rehearse against a restore, touching nothing remote.** ✅ **Done, and it
earned its keep on the first run.** `node scripts/migration-rehearsal.mjs
backups/hodgepodge-2026-09-03.d1.sql` restores the real backup into a throwaway
SQLite file, applies both migrations and asserts conservation, the new shape, and
that the cascade is gone — with foreign keys *enforced*, because a check with
them off proves nothing.

It caught the draft of 0006 destroying **every model row in the database**:
`arsenal_models: 23 → 0`. `arsenal_models.arsenal_id` cascades from
`arsenals(id)`, so `DROP TABLE arsenals` took them all, and the
`PRAGMA defer_foreign_keys` meant to prevent it does not — it defers constraint
*checking*, and a cascade is an *action*. Every other assertion passed while that
one line was wrong, which is exactly the shape of migration bug that reaches
production. 0006 now stashes the child rows and puts them back explicitly.

 Load the backup into
a local D1, point a local build at it with `npx wrangler pages dev dist`, and run
the whole reconcile — both migrations, both stores, two simulated devices. Every
mistake found here costs nothing.

**B. Fresh backup of remote, verified by restoring it.** Sessions stripped.

**C. Apply 0005.** ✅ **Done on remote, 2026-09-03.** Four columns verified
present; counts unchanged.

**D. Apply 0006.** ✅ **Done on remote, 2026-09-03.** Counts identical before and
after (6 campaigns, 6 arsenals, 23 models, 5 users, 1 member, 16 sessions), no
leftover `arsenals_new` or `arsenal_models_stash`, no orphaned models, every real
arsenal still seated, and all six campaign documents byte-for-byte identical to
the backup — same versions, same schema_version, same lengths.

The cascade assertion was made **on the live database**, not inferred: a throwaway
campaign and arsenal were created, the campaign deleted, and the arsenal survived
with `campaign_id IS NULL`. Both probe rows were then removed and the final counts
match the pre-state exactly.

### ⚠ Pull-only is not automatically safe. Read this before writing step E.

The obvious implementation loses a week of play, and `planSync` will not stop it.

Playing a week writes the **arsenal**. `saveArsenal` deliberately does not mark
anything dirty, and `planSync` decides pull-versus-push from the **campaign's**
dirty flag. So a device that played a week has a clean campaign and a changed
arsenal, `planSync` says *clean, and the server is ahead of my base → pull*, and
the pull lifts the v2 document — which writes `arsenal:<id>` and overwrites the
week.

Nothing in `planSync` is wrong. It was never told the arsenal exists. This is the
same shape as every data-loss bug this project has had: **a guard phrased about
one document and enforced against another** (v0.18.4, and the `baseVersion`
correction above).

Two changes close it, and neither is optional:

- **`saveArsenal` marks dirty**, exactly as `saveCampaign` does. It was written
  not to because arsenals did not sync; the moment a pull can overwrite one, the
  flag is what protects it. This is needed for step F anyway.
- **The lift-on-pull refuses to overwrite a dirty arsenal.** It reports a
  conflict instead — which is now a thing the app can actually do, because
  `ConflictNotice` exists. A pull that silently replaces a leader is the failure
  this whole plan is written to avoid, and it does not become acceptable just
  because the write arrived from the server.

**E. Ship sync in read-only mode: pull and lift, never push.** This is the step
that most reduces risk and it is the one most likely to be skipped. It restores
cross-device visibility — which is what the sync pause currently costs everyone —
while making it structurally impossible to damage the server. Prove on the
owner's own account, on two devices, that pulling a **v2** row produces a correct
local v3 pair.

**F. Enable pushes — and do not lean on the version gate to sequence it.**

An earlier draft claimed the `baseVersion` gate gave pull-before-push for free,
because every row was at version 0 and no client had ever been handed a 0. Both
halves of that were wrong, and a future session leaning on it would get a nasty
surprise:

- **Two rows are not at 0** (9 and 5), so a device already holding those numbers
  satisfies the gate today.
- **A client can hold 0 anyway.** `useSync` records the version for every
  campaign straight off the *listing*, before `planSync` decides anything, and
  `rememberVersion` stores 0 happily because `Number.isFinite(0)` is true. So
  "has been handed a version" is satisfied by having listed, which is not the
  same as having pulled the document.

That second point is the same class of gap CLAUDE.md already records from
v0.18.5 — *a guard phrased about a client but enforced against a document will
pass every time* — and it is not a bug in the gate. The gate's job is "is my copy
based on the current version?", and a listing genuinely answers it. It was never
going to answer "have I seen the current *shape*".

So the shape safety has to be explicit, and it is the server's job:

> `putCampaign` refuses a campaign whose `schemaVersion` is 3 or higher while the
> stored row is still at 2, unless the same request carries the arsenal — or the
> arsenal already exists as a v3 document.

Without that, a v3 client that has merely listed can push a campaign with no
leader in it over one of those two rows. That is T1, and `SYNC_DISABLED` is
currently the only thing preventing it.

**G. Watch a week, then retire the bridge** — `planSync`'s `updatedAt` fallback
and `SYNC_DISABLED` both go once no device is still arriving without version
facts.

---

## Gotchas, checked against a real D1 rather than reasoned about

The rehearsal in step A runs on Node's SQLite, which is *not* D1. Everything
below was re-checked by loading the backup into an actual local D1 through
wrangler and running the migrations there.

### Settled by testing

- **D1 accepts every statement in 0006.** `CREATE TABLE … AS SELECT`,
  `DROP TABLE`, `ALTER TABLE … RENAME TO` all run. 6 arsenals and 23 model rows
  in, 6 and 23 out, stash table cleaned up.
- **D1 enforces foreign keys.** The plan previously said not to assume either
  way. Deleting a campaign on the migrated schema released its arsenal to
  `campaign_id IS NULL` and left the row and all 23 models alive. So the new
  `ON DELETE SET NULL` genuinely works — and the old `ON DELETE CASCADE` was a
  genuinely live data-loss path, not a theoretical one.
- **`d1 execute --file` is atomic.** A file whose last statement fails rolls the
  whole thing back: a probe table created by statement one did not exist
  afterwards. **A half-applied migration is therefore not possible**, which
  removes the worst failure mode from 0006 entirely.
- **0006 is idempotent if it completes.** Re-running it on an already-migrated
  database succeeds and changes nothing, because every object it creates it also
  drops or renames within the same run. It is *not* recoverable by re-running if
  it dies partway — but per the previous point, it cannot.
- **Account erasure still erases.** `deleteAccount`'s exact statements, in its
  exact order, run against the migrated schema: the user's campaigns, arsenals
  and user row all go to zero, other players' data untouched. Worth checking
  because `SET NULL` could have left orphaned arsenals behind a deleted account,
  and §12 promises the rows stop existing.
- **The live write path is unaffected.** `putCampaign`'s arsenal INSERT names 14
  columns; the rebuilt table has 17. The insert succeeds and the three new
  columns take their defaults — `doc` NULL, `schema_version` 0, `version` 0 —
  which is exactly the "no v3 client has written this row yet" signal the pull
  path needs.
- **Applying the migrations is invisible to the running app.** With
  `SYNC_DISABLED` true nothing touches `/api/campaigns` at all, and the only
  other reader — the shared arsenal page — selects columns that all still exist.

### Live traps, not yet closed

- **⚠ There is no `d1_migrations` table.** Every migration here has been applied
  by hand with `d1 execute --file`, never through wrangler's migration system.
  So `wrangler d1 migrations apply` would find 0001–0006 in `./migrations`,
  believe none had run, and replay all six against a populated database.
  **Always `d1 execute --file`, one file at a time.** This trap predates this
  change and gets worse with every migration added.
- **⚠ 0005 must run before 0006.** 0006 copies `doc`, `schema_version` and
  `version`, which 0005 creates. Backwards it fails — harmlessly, given the
  atomicity above, but it fails.
- **`_cf_KV` is not in the backup.** Remote has twelve tables; the export has
  eleven. That table is Cloudflare's own and is presumably recreated on demand,
  but a bare-metal restore into an empty database has never been tried, so
  whether it matters is **unknown rather than fine**. It has no bearing on
  0005/0006, which do not touch it.

---

## The safety rules, collected

1. **The server never converts shapes.** Migration 0005 and 0006 do not touch
   `doc`. The lift is client-side, has 113 tests, a read-only dry-run tool, and
   has been run against all six real campaigns. A one-shot SQL rewrite of six
   JSON documents has none of those things.
2. **`doc` stays the source of truth; the columns stay a projection.** Splitting
   the document does not promote the columns.
3. **Pull before push, enforced by `baseVersion`,** not by convention.
4. **Conflicts are reported, never resolved.** Both copies untouched. The rule is
   unchanged and matters more now: an arsenal changes every week, so it will
   conflict more often than a campaign ever did.
5. ~~**The conflict screen should ship before F**~~ — **built, v0.20.0**, ahead
   of the migrations exactly as this argued. `src/lib/shape/compare.js` describes
   a conflict in the player's terms and `src/components/ConflictNotice.jsx` shows
   it on the shelf with keep mine / take theirs / keep both.

   Two things it changed that matter here. `useSync` now carries `conflicts` as
   **structured state** rather than an English sentence folded into `error`, so
   the per-kind generalisation below has something to widen rather than a string
   to parse. And the old on-screen advice — *"open it on one device and save to
   settle it"* — was **impossible to follow**: a conflict means the copy is
   already dirty and the base version already differs, so saving changes neither
   and the next reconcile reports the same conflict for ever.

   When `planSync` is called once per kind, the conflict entries must carry
   `kind` so the screen picks the right summary. It already does; keep it.
6. **Refuse a write that lowers `schema_version`** — and refuse one that *raises*
   it past a row whose arsenal has not been stored separately yet. The first
   closes T3, the second closes T1; an earlier draft had only the first, because
   it wrongly assumed the version gate covered the other direction.
7. **`v2-backup:campaign:<id>` stays on every device.** It costs a few kilobytes
   and it is the per-device undo for the entire cutover.
8. **`SYNC_DISABLED` stays a one-line kill switch** through the whole rollout, so
   a bad deploy is stopped by shipping one line rather than by a migration.
9. **Every remote statement is scoped by `owner_user_id`,** not by `id`. The
   database stopped being only yours in August.
10. **Take the backup again between D and E.** The one from B will be hours old
    by then, and hours is where a week of somebody's play lives.

---

## What this deliberately does not do

- **No server-side merge.** The server stores and versions; it never decides
  which of two documents is the real one.
- **No normalising of `injuries`, `equipment` or `games` into their tables.**
  They have been empty since 0001 and the data lives in `doc`. Widening the
  projection is a separate, unrelated change and mixing it in here would put a
  schema guess inside the one migration that must not be guessed at.
- **No touching `join_code`.** Unused since 0001, and it stays unused.
- **No cascade added in the other direction.** Deleting an arsenal must not touch
  its campaign; other players may still be sitting at it.
