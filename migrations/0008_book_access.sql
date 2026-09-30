-- Proving you own the book, once, per title.
--
-- Wyrd has no purchase API — no OAuth, no entitlement endpoint, nothing a fan
-- project can query. So a purchase cannot be *verified*; it can only be
-- *demonstrated*, by answering something only a person holding the book can
-- answer. That is what `book_challenges` is.
--
-- WHAT MAKES A FAIR QUESTION
--
-- The answer must not already be in this public repository. `src/data/` carries
-- every name, value, cost, page and suit, so questions about those are
-- answerable from a `git clone` and prove nothing. What the repo does NOT have
-- is the prose and the stat lines — The Silent Catalogue alone has 134 equipment
-- stat blocks that appear nowhere in `src/data/equipment.js`. Those are the
-- questions to ask.
--
-- ANSWERS ARE HASHED, AND THAT IS NOT DECORATION
--
-- `answer_hash` never holds plaintext, so this table cannot be mined for the
-- content it is protecting. `scripts/book-challenges.mjs` hashes at authoring
-- time from a gitignored local file; the plaintext answer never enters the
-- database or the repository.
--
-- ASKED ONCE, THEN NEVER AGAIN
--
-- `book_access` is the record that somebody has proved it. One row per user per
-- title, written on a correct answer and read on every `/api/book` call. Nobody
-- is asked twice — the point is to establish ownership, not to re-litigate it
-- every time they open a card.
--
-- AND IT HAS TO RESIST GUESSING
--
-- A stat line is a small number. "What is the Dmg?" has perhaps a dozen
-- plausible answers, so an unlimited-attempt challenge is not a challenge at
-- all. `book_challenge_attempts` is the throttle, and it is per user rather
-- than per challenge so that cycling questions does not reset it.

CREATE TABLE IF NOT EXISTS book_challenges (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  question    TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_challenges_title ON book_challenges(title);

CREATE TABLE IF NOT EXISTS book_access (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  granted_at   INTEGER NOT NULL,
  challenge_id TEXT,
  PRIMARY KEY (user_id, title)
);

CREATE TABLE IF NOT EXISTS book_challenge_attempts (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title    TEXT NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, title)
);

-- Which book a row of text came from. Added now, while the table is empty, so
-- that "I own Index of the Untold but not The Silent Catalogue" is answerable.
-- Retrofitting it later would mean guessing which book each row came from.
ALTER TABLE book_text ADD COLUMN title TEXT NOT NULL DEFAULT 'index-of-the-untold';
