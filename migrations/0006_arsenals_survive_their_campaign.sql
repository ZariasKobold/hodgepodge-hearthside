-- 0006 — an arsenal must outlive its campaign.
--
-- ⚠ This is the one migration in this project that can destroy rows. Read
-- `docs/sync-v3-plan.md` before running it, and do not run it against remote
-- without having run it against a restored backup first.
--
-- ## What is wrong today
--
-- From 0001, unchanged since:
--
--     campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE
--
-- Two clauses, both correct for v2 and both backwards for v3.
--
-- `NOT NULL` forbids an arsenal that is not at a table. In schemaVersion 3 an
-- arsenal is a durable personal object that exists *before* any campaign and
-- survives leaving one, so "at no table" is an ordinary state and the shelf
-- already renders it.
--
-- `ON DELETE CASCADE` is the serious one. In v2 the arsenal was part of the
-- campaign, so deleting the campaign taking the arsenal with it was right. In
-- v3 the arsenal holds the leader, the models, the scrip, the injuries and the
-- experience — everything the player thinks of as theirs — and the campaign is
-- just the table they sat at. Deleting a table would delete the people.
-- `docs/data-model-v3.md`, open question 3, says it plainly: *not a cascade —
-- that is the mistake this document exists to avoid repeating.*
--
-- ## Why a rebuild
--
-- SQLite cannot drop a NOT NULL and cannot alter a foreign key's delete action.
-- The only route is to build the table again and copy the rows across. That is
-- the "much bigger conversation" `docs/data-model-v3.md` anticipated, and it is
-- unavoidable: this is a live data-loss path that cannot be closed from the
-- application side, because the database performs the cascade itself.
--
-- ## The trap this migration fell into once, caught in rehearsal
--
-- `arsenal_models.arsenal_id` references `arsenals(id)` **ON DELETE CASCADE**.
-- So `DROP TABLE arsenals` does not merely drop a table — it fires the cascade
-- and takes every model row in the database with it.
--
-- The first draft tried to prevent that with `PRAGMA defer_foreign_keys = TRUE`,
-- which does not work and is worth knowing why: that pragma defers constraint
-- *checking* to the end of the transaction, and a cascade is not a check, it is
-- an action. `scripts/migration-rehearsal.mjs` ran the draft against a restored
-- copy of the real database and reported `arsenal_models: 23 → 0`. Every model
-- every player owns, gone, silently, with all the other assertions passing.
--
-- `PRAGMA foreign_keys = OFF` would have worked and is not available: SQLite
-- refuses it inside a transaction, and D1 runs migrations in one.
--
-- So the child rows are stashed and put back explicitly. More statements, but it
-- depends on nothing subtle — the data is copied out, the cascade is allowed to
-- do its worst, and the data is copied back.
CREATE TABLE arsenal_models_stash AS SELECT * FROM arsenal_models;

CREATE TABLE arsenals_new (
  id             TEXT PRIMARY KEY,
  -- The whole migration is these two changes. Nullable, so an arsenal can sit
  -- on the shelf at no table; SET NULL, so winding up a campaign releases its
  -- players' leaders instead of deleting them.
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
  -- Kept, and it still means what it meant: one arsenal per player per table.
  -- SQLite treats NULLs as distinct in a UNIQUE, so a player may have any
  -- number of *unseated* arsenals — which is exactly what a shelf of leaders
  -- is.
  UNIQUE (campaign_id, user_id)
);

INSERT INTO arsenals_new
  (id, campaign_id, user_id, faction, keyword_a, keyword_b, scrip,
   leader, crew_card, total_cost, updated_at, injuries, equipment, totem,
   doc, schema_version, version)
  SELECT
   id, campaign_id, user_id, faction, keyword_a, keyword_b, scrip,
   leader, crew_card, total_cost, updated_at, injuries, equipment, totem,
   doc, schema_version, version
  FROM arsenals;

-- Empties `arsenal_models` as a side effect. That is expected, and the stash
-- above is why it is survivable.
DROP TABLE arsenals;

ALTER TABLE arsenals_new RENAME TO arsenals;

-- Put the models back, now that the arsenals they reference exist again.
-- Columns named rather than `SELECT *`, so a future column added to
-- `arsenal_models` cannot silently reorder this.
INSERT INTO arsenal_models
  (id, arsenal_id, slug, name, cost, added_week, scrip_paid, title_group, annihilated)
  SELECT id, arsenal_id, slug, name, cost, added_week, scrip_paid, title_group, annihilated
    FROM arsenal_models_stash;

DROP TABLE arsenal_models_stash;

-- Both indexes are recreated: the one from 0001 went with the old table, and
-- the one from 0005 went with it too.
CREATE INDEX idx_arsenals_campaign ON arsenals (campaign_id);
CREATE INDEX idx_arsenals_user     ON arsenals (user_id, updated_at DESC);
