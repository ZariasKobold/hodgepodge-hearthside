-- Hodgepodge Hearthside — initial schema
-- See docs/data-model.md for why each table is shaped this way.

-- Accounts -------------------------------------------------------------
-- OAuth only, no passwords. Deliberately no email column: we never need to
-- contact anyone, and not storing it means nothing to leak and nothing to
-- delete on request.
CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  provider         TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  avatar_url       TEXT,
  created_at       INTEGER NOT NULL,
  UNIQUE (provider, provider_user_id)
);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Campaigns ------------------------------------------------------------
-- current_week is NOT stored. It derives from started_at + weekLengthDays,
-- because a counter is only right if someone remembers to press a button.
CREATE TABLE campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  weeks_total   INTEGER NOT NULL DEFAULT 12,
  started_at    INTEGER NOT NULL,
  week_offset   INTEGER NOT NULL DEFAULT 0,
  house_rules   TEXT NOT NULL DEFAULT '{}',
  join_code     TEXT UNIQUE,
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_campaigns_owner ON campaigns(owner_user_id);

CREATE TABLE campaign_members (
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'player',
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);
CREATE INDEX idx_members_user ON campaign_members(user_id);

-- Arsenals -------------------------------------------------------------
-- total_cost is denormalised on purpose: max encounter size is the most
-- common cross-player question, and summing every model on both sides would
-- be exactly the N+1 that D1's 50-query cap punishes. Recalculate it in the
-- same transaction as any model change.
CREATE TABLE arsenals (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(id),
  faction     TEXT NOT NULL DEFAULT '',
  keyword_a   TEXT NOT NULL DEFAULT '',
  keyword_b   TEXT NOT NULL DEFAULT '',
  scrip       INTEGER NOT NULL DEFAULT 0,
  leader      TEXT NOT NULL DEFAULT '{}',
  crew_card   TEXT NOT NULL DEFAULT '{}',
  total_cost  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX idx_arsenals_campaign ON arsenals(campaign_id);

CREATE TABLE arsenal_models (
  id          TEXT PRIMARY KEY,
  arsenal_id  TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  slug        TEXT,
  name        TEXT NOT NULL,
  cost        INTEGER NOT NULL,
  added_week  INTEGER NOT NULL,
  scrip_paid  INTEGER NOT NULL DEFAULT 0,
  title_group TEXT,
  annihilated INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_models_arsenal ON arsenal_models(arsenal_id);
CREATE INDEX idx_models_title ON arsenal_models(arsenal_id, title_group);

-- Exactly one of model_id / title_group is set, or neither for the leader.
-- Titled models share injuries, so storing once against the group is the only
-- shape that can't drift out of sync.
CREATE TABLE injuries (
  id           TEXT PRIMARY KEY,
  arsenal_id   TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  model_id     TEXT REFERENCES arsenal_models(id) ON DELETE CASCADE,
  title_group  TEXT,
  name         TEXT NOT NULL,
  flip_value   INTEGER,
  applied_week INTEGER NOT NULL,
  permanent    INTEGER NOT NULL DEFAULT 0,
  removed_at   INTEGER
);
CREATE INDEX idx_injuries_arsenal ON injuries(arsenal_id);

CREATE TABLE equipment (
  id            TEXT PRIMARY KEY,
  arsenal_id    TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  barter_rating TEXT,
  rating_cost   INTEGER NOT NULL DEFAULT 0,
  acquired_week INTEGER NOT NULL,
  persistent    INTEGER NOT NULL DEFAULT 0,
  annihilated   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_equipment_arsenal ON equipment(arsenal_id);

-- Games ----------------------------------------------------------------
CREATE TABLE games (
  id                   TEXT PRIMARY KEY,
  campaign_id          TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  arsenal_id           TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  opponent_arsenal_id  TEXT REFERENCES arsenals(id),
  week                 INTEGER NOT NULL,
  played_at            INTEGER NOT NULL,
  encounter_size       INTEGER,
  strategy             TEXT,
  schemes_completed    INTEGER NOT NULL DEFAULT 0,
  vp_self              INTEGER,
  vp_opponent          INTEGER,
  result               TEXT,
  withdrew             INTEGER NOT NULL DEFAULT 0,
  withdrew_on_turn     INTEGER,
  campaign_rating_self INTEGER,
  campaign_rating_opp  INTEGER,
  killed_model_ids     TEXT NOT NULL DEFAULT '[]',
  aftermath            TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_games_campaign_week ON games(campaign_id, week);
CREATE INDEX idx_games_arsenal ON games(arsenal_id);

-- Equipment attachment is chosen fresh at the Hire Crew step of EVERY
-- encounter, so it belongs to the game, not to the equipment row.
CREATE TABLE game_equipment (
  game_id      TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  model_id     TEXT REFERENCES arsenal_models(id) ON DELETE SET NULL,
  PRIMARY KEY (game_id, equipment_id)
);
