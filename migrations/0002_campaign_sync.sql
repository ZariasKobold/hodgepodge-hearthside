-- 0002 — campaign sync
--
-- Migrations are append-only. 0001 has run against the remote database and is
-- never edited; this adds to it.
--
-- Why a `doc` column beside the normalized ones.
--
-- 0001 designed the campaign properly: owner on `campaigns`, one row per model
-- in `arsenal_models`, JSON only where the shape is genuinely free-form
-- (`leader`, `crew_card`, `house_rules`). That design is right and is kept.
--
-- But the local shape is still moving — `injuries`, `equipment` and `games` are
-- written by nothing yet, and Aftermath will change all three. Normalizing them
-- now means guessing, and CLAUDE.md §12 is explicit that schema built on guesses
-- is expensive once anyone has saved data.
--
-- So: `doc` holds the complete campaign document and is the source of truth on
-- read. The normalized columns are a projection of it, written on the same
-- upsert, and exist so the server can scope, list and sort **without parsing
-- JSON** — which is what actually matters for authorization. Nothing is lost
-- when the shape changes, and when Aftermath settles, the projection widens
-- into the tables 0001 already provides.
--
-- `schema_version` travels with the doc so a future client knows whether the
-- row predates a migration it cares about.

ALTER TABLE campaigns ADD COLUMN doc TEXT NOT NULL DEFAULT '{}';
ALTER TABLE campaigns ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE campaigns ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;

-- Listing a player's shelf is one query, scoped by owner. Without row-level
-- security this WHERE clause *is* the access control, so it is indexed and
-- never optional.
CREATE INDEX IF NOT EXISTS idx_campaigns_owner
  ON campaigns (owner_user_id, updated_at DESC);
