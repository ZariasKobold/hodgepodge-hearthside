-- 0005 — the arsenal becomes a synced document in its own right.
--
-- Migrations are append-only. 0001–0004 have run against the remote database
-- and are never edited; everything here is an ADD COLUMN or a CREATE INDEX, so
-- this file cannot destroy a row. The dangerous half is 0006, deliberately kept
-- separate so it can be applied and verified on its own.
--
-- ## Why the arsenal needs a `doc` at all
--
-- `arsenals` has existed since 0001, but as a **projection**: faction, keywords,
-- scrip, a `leader` blob, `crew_card`, `total_cost`, and since 0003 `injuries`,
-- `equipment` and `totem`. That is what the shared page reads, and it is
-- deliberately lossy — it has no `crewCardAdvancements`, no `displayName`, no
-- `startingScripGranted`, no `schemaVersion`.
--
-- Lossy is correct for a projection and fatal for a sync unit. In schemaVersion
-- 3 the arsenal is where the leader, the models, the scrip and the injuries
-- live (`docs/data-model-v3.md`), so it has to round-trip exactly or syncing it
-- would quietly file down somebody's campaign every time it crossed the wire.
--
-- So: `doc` is the source of truth, the columns stay a projection. Same split
-- 0002 made for campaigns and for the same reason — and the split is a privacy
-- boundary as much as a schema, because the shared arsenal page reads the
-- columns and never `doc`. Adding `doc` does not widen what other players see.
--
-- NULL rather than a `'{}'` default, and the difference carries meaning: NULL is
-- "no v3 client has ever written this row", which is exactly the question the
-- pull path needs to ask. `'{}'` would be indistinguishable from an empty
-- arsenal somebody really saved.
ALTER TABLE arsenals ADD COLUMN doc TEXT;

-- Which shape that `doc` is in. 0 means "no document yet" — see above.
ALTER TABLE arsenals ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 0;

-- The server-assigned counter campaigns got in 0004, for the identical reason:
-- a client may only write if it names the exact version it is replacing, so
-- "am I based on the current copy?" is a fact the client was told rather than
-- an inference from two unsynchronised clocks.
--
-- DEFAULT 0 is the same deliberate trick. No client has ever been handed 0, so
-- the first write from any device is refused until it has pulled once. That one
-- refusal per device per arsenal *is* the reconciliation, and its absence is
-- what lost data in v0.18.4.
ALTER TABLE arsenals ADD COLUMN version INTEGER NOT NULL DEFAULT 0;

-- The participation gains the arsenal that player brought to the table.
-- `campaign_members` is already the join `docs/data-model-v3.md` describes; this
-- is the column that finishes it and retires `campaigns.member_of`'s reason for
-- existing.
ALTER TABLE campaign_members ADD COLUMN arsenal_id TEXT REFERENCES arsenals(id);

-- Listing one player's arsenals is a single query scoped by owner. There is no
-- row-level security in D1, so this WHERE clause *is* the access control
-- (CLAUDE.md §12) — which makes indexing it a correctness concern rather than a
-- performance one.
CREATE INDEX IF NOT EXISTS idx_arsenals_user ON arsenals (user_id, updated_at DESC);
