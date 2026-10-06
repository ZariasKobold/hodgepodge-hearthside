-- The crew builder, Phase B: two players hiring for one game, each hidden from
-- the other until both have revealed (p. 19: the campaign rating is worked out
-- "after hiring and revealing crews").
--
-- WHY NOT THE HOST'S CAMPAIGN DOCUMENT
--
-- The design sketch in docs/data-model-v3.md put the encounter inside the
-- host's campaign `doc`. Two things are wrong with that, and the owner agreed
-- (Session 74): the host can read their own document, so a "hidden" crew would
-- not be hidden from them; and a member would have to write the host's row,
-- which is the widening of writes that opened the arsenal_models hole in v0.7.0.
--
-- So: one session row, and one row per seat, each written only by the player
-- in it. functions/lib/encounterStore.js holds the rules and its tests attack
-- them against this schema.
--
-- WHAT IS STORED
--
-- `crew` is a summary the client builds at reveal: names, costs, who carries
-- which piece of kit, the cost and the rating. Never rules text (section 4),
-- and the server re-serialises it field by field, so nothing else gets in.
-- It is NULL until that seat reveals.
--
-- `arsenal_id` carries no foreign key on purpose. Arsenal rows are upserted by
-- sync and must never cascade a game record away; the seat is erased with its
-- user (ON DELETE CASCADE below) or its table.
--
-- Apply with `wrangler d1 execute --file`, never `migrations apply` (CLAUDE.md).
-- Independent of 0007-0009.

CREATE TABLE IF NOT EXISTS shared_encounters (
  id          TEXT    PRIMARY KEY,
  table_id    TEXT    NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  created_by  TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week        INTEGER,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS encounter_crews (
  encounter_id  TEXT    NOT NULL REFERENCES shared_encounters(id) ON DELETE CASCADE,
  user_id       TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  arsenal_id    TEXT    NOT NULL,
  crew          TEXT,
  revealed_at   INTEGER,
  closed_at     INTEGER,
  PRIMARY KEY (encounter_id, user_id)
);

CREATE INDEX IF NOT EXISTS encounter_crews_user ON encounter_crews (user_id, closed_at);
CREATE INDEX IF NOT EXISTS shared_encounters_table ON shared_encounters (table_id);
