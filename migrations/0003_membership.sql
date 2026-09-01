-- 0003 — campaign membership: invites, members, and the shared arsenal view.
--
-- Append-only. 0001 and 0002 have run against the remote database and must not
-- be edited; everything here is a new table or an ADD COLUMN.
--
-- ## Why membership is a link between campaigns, not several owners of one
--
-- The obvious shape is: one `campaigns` row is the group, and everybody's
-- arsenal hangs off it. That would mean widening `putCampaign` so a member may
-- write into a campaign they do not own — and that is precisely the change that
-- opened the `arsenal_models` hole in v0.7.0, where a signed-in stranger could
-- wipe another player's model rows. CLAUDE.md §12 names it as the risky one.
--
-- So writes are not widened at all. Every player keeps owning their own
-- campaign row, containing their own arsenal, written by the same owner-scoped
-- `putCampaign` that exists today. Membership is a **pointer**: a player's own
-- campaign carries `member_of`, naming the campaign they joined.
--
--   Alice's campaign  H   (member_of NULL — she is the host)
--   Bob's campaign    B   (member_of = H)
--   Carol's campaign  C   (member_of = H)
--
-- The shared page is then one read across campaigns linked to H, and the rule
-- CLAUDE.md states holds without a single write path changing:
--
--   > Read an arsenal if you are a member of its campaign.
--   > Write only your own. Delete only your own campaign.
--
-- ## What `join_code` is still doing here
--
-- Nothing, and deliberately. It is in 0001, unused, and stays unused: a bare
-- join code is a capability URL — anyone holding it is in, and being in means
-- seeing other players' identities. Owner-issued invites below replace it. The
-- column is left rather than dropped because dropping a column in SQLite is a
-- table rebuild, and an unused nullable column costs nothing.

-- Which campaign this one has joined, if any. NULL means it is its own island,
-- or is itself the host others point at.
ALTER TABLE campaigns ADD COLUMN member_of TEXT REFERENCES campaigns(id);
CREATE INDEX idx_campaigns_member_of ON campaigns(member_of);

-- Membership, with the two gates the owner asked for: redeeming an invite makes
-- you `pending`, and only the host admitting you makes you `active`. A
-- forwarded link therefore cannot put a stranger in front of anyone's data — it
-- can only put their name in front of the host.
ALTER TABLE campaign_members ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- What other members see. The campaign nickname is the *only* identity that
-- crosses between players by default: no Discord display name, no avatar. That
-- is the leak the owner named when ruling out join codes — "so random people
-- don't just decide to join your campaign and gain information about your
-- discord" — and the cheapest way to not leak something is not to send it.
ALTER TABLE campaign_members ADD COLUMN nickname TEXT NOT NULL DEFAULT '';

-- Opt in, per campaign, to showing your Discord name and avatar to the others.
-- 0 = show only the nickname. The default is the private one on purpose: a
-- privacy setting whose default leaks is not a setting, it is a formality.
ALTER TABLE campaign_members ADD COLUMN share_identity INTEGER NOT NULL DEFAULT 0;

-- Owner-issued invites: single-use, expiring, revocable.
--
-- `token_hash` rather than the token. The row is the thing an attacker with
-- read access to the database would want, and a hash is useless to them — the
-- token exists only in the link the host sends. Same reasoning as never storing
-- a password.
CREATE TABLE campaign_invites (
  id          TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  issued_by   TEXT NOT NULL REFERENCES users(id),
  token_hash  TEXT NOT NULL UNIQUE,
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  redeemed_by TEXT REFERENCES users(id),
  redeemed_at INTEGER,
  revoked_at  INTEGER
);
CREATE INDEX idx_invites_campaign ON campaign_invites(campaign_id);

-- The arsenal projection, widened enough to render a read-only sheet.
--
-- Migration 0002 deferred normalising these on the grounds that Aftermath would
-- reshape them, and it did. The shapes are real and played now, so the reason to
-- wait has expired. Stored as JSON on the arsenal row rather than as three more
-- tables because the shared page reads every member's arsenal at once, and
-- D1's free plan caps a Worker at 50 queries — a table per collection is the
-- N+1 that CLAUDE.md §12b forbids.
--
-- `doc` remains the source of truth for the owner's own copy. These columns are
-- what *other people* are allowed to read, which is why the shared read never
-- touches `doc`: the doc is the whole campaign, and a member is entitled to the
-- arsenal, not to everything.
ALTER TABLE arsenals ADD COLUMN injuries TEXT NOT NULL DEFAULT '[]';
ALTER TABLE arsenals ADD COLUMN equipment TEXT NOT NULL DEFAULT '[]';
ALTER TABLE arsenals ADD COLUMN totem TEXT;
