-- Which book text each user has been served, and when they first saw it.
--
-- Audit v0.28.1 H2: the entitlement in `bookStore.js` reads `arsenals.doc`,
-- which the client writes, so "holds this entry" means "claims to". This table
-- is the friction that does not depend on trusting that document. A key served
-- once is served again freely; at most NEW_KEYS_PER_DAY keys a user has never
-- seen before are served per rolling 24 hours.
--
-- Scoped by user_id like every other per-user table. Holds key names and a
-- timestamp only, never text (section 4).
--
-- Apply with `wrangler d1 execute --file`, never `migrations apply` (CLAUDE.md).
-- Like 0007 and 0008 it is not yet applied to remote, and it goes on with them.

CREATE TABLE IF NOT EXISTS book_served (
  user_id   TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key       TEXT    NOT NULL,
  first_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS book_served_recent ON book_served (user_id, first_at);
