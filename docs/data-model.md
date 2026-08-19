# Data model — campaigns, accounts, and D1

Design document. **Nothing here is implemented yet.** It exists so the shape is
settled before anyone saves a campaign, because changing the shape after that
means writing migration code instead of editing a file.

---

## 1. What the rules force

Most of this design comes from three requirements in *Index of the Untold*
rather than from convenience:

1. **Max encounter size is `min(both arsenals) + 6`.** Two players need each
   other's arsenal totals before a game.
2. **Soulstone bonus comes from comparing campaign ratings.** Equipment,
   advancements, and injuries on both sides.
3. **Arsenals are public knowledge by design.** Not a privacy problem — a
   sharing problem.

That's why this is a database and not a JSON blob. If a campaign were one
opaque document, answering "what's the max encounter size between these two
players" would mean loading both campaigns whole. These are the queries that
justify D1 over KV.

---

## 2. D1 limits that shape the design

Workers Free plan, verified against Cloudflare's limits page:

| Limit | Free | Consequence |
|---|---|---|
| Databases per account | 10 | One is plenty. Unlike Supabase's project cap, this won't bite. |
| Max database size | 500 MB | Enormous for text records. Thousands of campaigns. |
| Storage per account | 5 GB | Shared across all databases. |
| Rows read / day | 5,000,000 | Not a concern. |
| Rows written / day | 100,000 | Not a concern for weekly updates. |
| **Queries per Worker invocation** | **50** | **This one matters.** |

That last row is the real constraint. Loading a campaign must be a handful of
queries, not one per model. Design endpoints to fetch sets, never to loop.

---

## 3. Accounts — the lightest thing that works

The requirement is "people can sign up and be invited." The requirement is
**not** "build an auth system."

**Recommendation: OAuth only. No passwords, ever.**

Rolling your own signup means storing password hashes, building reset flows,
sending email, and holding email addresses — which is PII, on a project you
are contractually barred from monetizing. OAuth is *less* work and *less*
liability at the same time, which is rare.

Providers, in order of fit:

- **Discord** — where wargaming groups already live. A player invited to a
  campaign is almost certainly already in a Discord with the organizer.
- **Google** — the universal fallback.

Store only what's needed:

```sql
CREATE TABLE users (
  id                TEXT PRIMARY KEY,        -- our uuid, never the provider's
  provider          TEXT NOT NULL,           -- 'discord' | 'google'
  provider_user_id  TEXT NOT NULL,
  display_name      TEXT NOT NULL,           -- shown to other players
  created_at        INTEGER NOT NULL,
  UNIQUE (provider, provider_user_id)
);
```

**Deliberately absent: email.** We never need to contact anyone. Not storing it
means no breach exposure, no unsubscribe handling, and nothing to delete on
request. If a feature later seems to need email, question the feature first.

```sql
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,   -- random 32 bytes, httpOnly + Secure cookie
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
```

---

## 4. Campaigns and membership

```sql
CREATE TABLE campaigns (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  owner_user_id  TEXT NOT NULL REFERENCES users(id),
  weeks_total    INTEGER NOT NULL DEFAULT 12,

  -- Week boundaries are a calendar fact, not a counter. The book says weeks
  -- begin "on the designated day", so store when the campaign started and how
  -- long a week is, then DERIVE the current week. Storing current_week means
  -- somebody has to remember to increment it, and they won't.
  started_at     INTEGER NOT NULL,            -- the first designated day
  week_offset    INTEGER NOT NULL DEFAULT 0,  -- manual nudge; see below

  house_rules    TEXT NOT NULL DEFAULT '{}',  -- JSON; see §8
  join_code      TEXT UNIQUE,                 -- short, shareable, revocable
  created_at     INTEGER NOT NULL
);

CREATE TABLE campaign_members (
  campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'player',  -- 'organizer' | 'player'
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (campaign_id, user_id)
);
```

### Deriving the current week

```js
export function currentWeek({ startedAt, weekLengthDays = 7, weekOffset = 0 }, now = Date.now()) {
  const elapsed = Math.floor((now - startedAt) / (weekLengthDays * 86400000))
  return Math.max(1, elapsed + 1 + weekOffset)
}
```

`week_offset` exists because real groups skip weeks. Everyone is busy, nobody
plays, and the campaign shouldn't silently burn a week of its twelve. The
organizer nudges the offset back by one and the calendar realigns.

The alternative — storing `current_week` and advancing it manually — means the
number is wrong whenever nobody remembers to press the button, and every
player's app disagrees about what week it is.

### Invites

**Join codes, not email invitations.** A six-character code the organizer pastes
into Discord — `HEARTH-7K2Q`. Anyone with the code and an account can join.

Why not emailed invites: it would require storing emails and sending mail, both
of which §3 avoids. A code shared in the group chat the campaign already lives
in is how these groups actually coordinate.

Codes are revocable (`UPDATE campaigns SET join_code = NULL`) and regenerable.
Losing one to a stranger means a stranger sees a hobby campaign's arsenal list,
which is public information among the players anyway.

---

## 5. Arsenals

```sql
CREATE TABLE arsenals (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id),
  faction       TEXT NOT NULL,
  keyword_a     TEXT NOT NULL,
  keyword_b     TEXT NOT NULL,
  scrip         INTEGER NOT NULL DEFAULT 0,

  -- Nothing queries inside these, so they stay JSON.
  leader        TEXT NOT NULL,   -- archetype, stats, picks, trigger, characteristics
  crew_card     TEXT NOT NULL,   -- effect ids + choices

  -- DENORMALIZED on purpose. Encounter size is the single most common
  -- cross-player question; recomputing it by summing arsenal_models for two
  -- players every time is exactly the N+1 the 50-query cap punishes.
  -- Recalculate on every model add/remove, in the same transaction.
  total_cost    INTEGER NOT NULL DEFAULT 0,

  updated_at    INTEGER NOT NULL,
  UNIQUE (campaign_id, user_id)
);
CREATE INDEX idx_arsenals_campaign ON arsenals(campaign_id);
```

The leader block stays JSON deliberately. `picks`, `characteristics`, and the
crew card are read whole and written whole — normalizing them would buy nothing
and cost joins.

```sql
CREATE TABLE arsenal_models (
  id           TEXT PRIMARY KEY,
  arsenal_id   TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  slug         TEXT,                 -- register slug, null if entered by hand
  name         TEXT NOT NULL,
  cost         INTEGER NOT NULL,
  added_week   INTEGER NOT NULL,
  scrip_paid   INTEGER NOT NULL DEFAULT 0,

  -- Adding a titled model adds EVERY version of it in one hire, for one price.
  -- All rows in a group share a title_group; injuries attach to the group, not
  -- the row (see below). Emissaries and Effigies look titled but are the stated
  -- exception: added separately, injured separately, so title_group is NULL.
  title_group  TEXT,
  annihilated  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_models_arsenal ON arsenal_models(arsenal_id);
CREATE INDEX idx_models_title ON arsenal_models(arsenal_id, title_group);
```

```sql
CREATE TABLE injuries (
  id           TEXT PRIMARY KEY,
  arsenal_id   TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,

  -- Exactly one of these is set, and never both:
  --   model_id    — an ordinary model, or an Emissary/Effigy
  --   title_group — a titled model; ALL its versions share the injury, so
  --                 storing it once against the group is the only shape that
  --                 can't drift out of sync
  --   both NULL   — the leader
  model_id     TEXT REFERENCES arsenal_models(id) ON DELETE CASCADE,
  title_group  TEXT,

  name         TEXT NOT NULL,
  flip_value   INTEGER,
  applied_week INTEGER NOT NULL,
  permanent    INTEGER NOT NULL DEFAULT 0,
  removed_at   INTEGER                     -- set when healed; keeps the history
);
CREATE INDEX idx_injuries_arsenal ON injuries(arsenal_id);
```

Injuries are soft-deleted rather than removed, because campaign rating counts
*current* injuries but the week log should still show what happened.

```sql
CREATE TABLE equipment (
  id             TEXT PRIMARY KEY,
  arsenal_id     TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  barter_rating  TEXT,                        -- e.g. "13 of C or T", "always available"
  rating_cost    INTEGER NOT NULL DEFAULT 0,  -- the CC column
  acquired_week  INTEGER NOT NULL,
  persistent     INTEGER NOT NULL DEFAULT 0,  -- Lucky Upstart's free pick returns
  annihilated    INTEGER NOT NULL DEFAULT 0   -- removed from the arsenal entirely
);
CREATE INDEX idx_equipment_arsenal ON equipment(arsenal_id);

-- Attachment is chosen fresh at the Hire Crew step of EVERY encounter, so it
-- is a fact about a game, not about the item. An earlier draft put
-- `attached_to` on the equipment row; that was wrong. It would have made a
-- per-encounter decision look permanent, and quietly broken campaign rating,
-- which counts equipment *selected when hiring* rather than equipment owned.
CREATE TABLE game_equipment (
  game_id       TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  equipment_id  TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  model_id      TEXT REFERENCES arsenal_models(id) ON DELETE SET NULL,
  PRIMARY KEY (game_id, equipment_id)
);

-- Annihilation vs discard: equipment that must be annihilated to work leaves
-- the arsenal and must be bought again. Equipment merely discarded during a
-- game stays. Only the former sets `annihilated`.
```

---

## 6. Games and the week log

```sql
CREATE TABLE games (
  id                     TEXT PRIMARY KEY,
  campaign_id            TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  arsenal_id             TEXT NOT NULL REFERENCES arsenals(id) ON DELETE CASCADE,
  opponent_arsenal_id    TEXT REFERENCES arsenals(id),   -- null if outside the campaign
  week                   INTEGER NOT NULL,
  played_at              INTEGER NOT NULL,
  encounter_size         INTEGER,
  strategy               TEXT,
  vp_self                INTEGER,
  vp_opponent            INTEGER,
  result                 TEXT,          -- 'win' | 'loss' | 'draw'
  withdrew               INTEGER NOT NULL DEFAULT 0,

  -- Per-game, not per-arsenal: rating counts equipment selected AT HIRING.
  campaign_rating_self   INTEGER,
  campaign_rating_opp    INTEGER,

  -- Injury flips key off models KILLED in the game, not models in the crew,
  -- so the killed list has to be recorded. JSON array of arsenal_model ids.
  killed_model_ids       TEXT NOT NULL DEFAULT '[]',

  aftermath              TEXT NOT NULL DEFAULT '{}'  -- see below
);
CREATE INDEX idx_games_campaign_week ON games(campaign_id, week);
CREATE INDEX idx_games_arsenal ON games(arsenal_id);
```

### The aftermath JSON

Six phases, run in order (*Index of the Untold* pp.20-36). The order is
load-bearing: **the fate deck is not reshuffled between phases**, so a black
joker spent on barter cannot reappear on injuries. Cards cheat, never empower,
and each flip must be resolved before the next is made.

```json
{
  "handSize": 3,
  "phasesComplete": ["draw_hand", "payday", "barter"],
  "payday": { "vp": 4, "won": true, "ratingBonus": 2, "scripEarned": 5 },
  "barter": { "flip": 11, "purchased": [{ "equipmentId": "...", "cc": 2 }] },
  "advancement": { "xpEarned": 2, "boxChecked": 5, "table": "attack_modification", "flip": 9 },
  "doctor": [
    { "modelId": "...", "injuryId": "...", "scripPaid": 1, "flip": 12, "outcome": "healed" },
    { "modelId": "...", "injuryId": "...", "scripPaid": 1, "flip": 4,  "outcome": "no_effect" }
  ],
  "injuries": [
    { "modelId": "...", "flip": 7, "injuryName": "..." }
  ]
}
```

Notes that shape the UI:

- **Payday** is `ceil(vp / 3) + (won ? 1 : 0) + max(0, oppRating - myRating)`.
  The rating bonus is **uncapped**, unlike the soulstone bonus which caps at +3.
  That asymmetry is in the book; we follow it.
- **Barter is one flip**, but any number of items matching it may be bought,
  plus anything with a BR of "always available".
- **The doctor charges 1 scrip per attempt and keeps it regardless.** Outcomes
  include making things worse, and healing on a 10 or 11 leaves the model with
  the Undead or Construct characteristic — so a heal can change a model's
  characteristics, not just remove a row.
- **Annihilation is checked at the end of phase 6**, not as injuries land. A
  model can pass through 3+ mid-phase without being annihilated.
- **Withdrawal by turn two** means no VP, no barter flip, no hand, and scrip
  earned this game is lost. That crew skips the entire aftermath *except*
  flipping for injuries.

This is now implemented and tested in `src/lib/campaign.js` — `payday`,
`aftermathHandSize`, `injuryFlipCount`, `isAnnihilated`, `AFTERMATH_PHASES`.

---

## 7. The queries that justify all this

**Max encounter size between two players — one query, no model rows read:**

```sql
SELECT MIN(total_cost) + 6 AS max_encounter
FROM arsenals
WHERE id IN (?, ?);
```

**Campaign standings:**

```sql
SELECT a.user_id, u.display_name, a.total_cost,
       COUNT(CASE WHEN g.result = 'win' THEN 1 END) AS wins
FROM arsenals a
JOIN users u ON u.id = a.user_id
LEFT JOIN games g ON g.arsenal_id = a.id
WHERE a.campaign_id = ?
GROUP BY a.id;
```

**Current campaign rating for one arsenal:**

```sql
SELECT
  (SELECT COUNT(*) FROM equipment WHERE arsenal_id = ? AND annihilated = 0)
  - (SELECT COUNT(*) FROM injuries WHERE arsenal_id = ? AND removed_at IS NULL)
  AS rating_base;
```

Advancements come from the leader JSON and are added client-side.

**Loading a full campaign: six queries.** Campaign, members, arsenals, models,
injuries, equipment — each fetching a whole set with `WHERE campaign_id = ?` or
`WHERE arsenal_id IN (...)`. Well inside the 50-query cap. **Never loop a query
per arsenal or per model.**

---

## 8. House rules

`campaigns.house_rules` is JSON because groups differ and the shape will grow:

```json
{
  "allowNegativeHireCost": false,
  "surchargeBeforeDiscount": true,
  "weekLengthDays": 7
}
```

`weekLengthDays` is explicitly sanctioned by the book, which invites groups to
run "weeks" of three days or even one day. Don't hardcode seven anywhere —
`currentWeek()` above already takes it as a parameter.

These feed `hireCost()` in `src/lib/campaign.js`, which already accepts them.
See the rules-gap note in CLAUDE.md §12 — the negative-scrip case is real and
groups will disagree about it.

---

## 9. Client shape

`useLeader` currently models a single leader. It becomes `useCampaign`:

```js
{
  id, name, weeksTotal, startedAt, weekOffset, houseRules, joinCode, role,
  // currentWeek is DERIVED, never stored — see §4
  members: [{ userId, displayName, role }],
  arsenals: [{
    id, userId, displayName, faction, keywords: [a, b], scrip, totalCost,
    leader: { archetype, stats, characteristics, size, base,
              advancementPath, picks, trigger, advancements, experience },
    crewCard: { effect, choice },
    models: [...], injuries: [...], equipment: [...]
  }],
  games: [...]
}
```

`myArsenal` is a derived selector, not stored separately.

---

## 10. Local-first stays

Remote storage does **not** replace local. Permission from Wyrd is revocable at
any time, so a campaign must survive this app disappearing.

`src/lib/storage.js` becomes two adapters behind the existing interface:

- **local** — what exists now, and the fallback when the network or D1 is
  unreachable *after* a user has been admitted
- **remote** — D1 through Pages Functions, the primary store

Rules for the split:
- **Superseded in v0.4.8:** this previously read "signed out, the app works
  fully against local storage — accounts are for *sharing*, not for *using*."
  Play is now gated behind sign-in, so there is no signed-out campaign to
  support. Local storage remains the offline fallback for an admitted user,
  not an anonymous mode.
- Every campaign still exports to JSON, from either adapter.
- Remote failure degrades to local and warns; it never blocks play. Game night
  does not wait for a database.

---

## 11. Build order

1. `Campaign` shape client-side, local storage only — no accounts, no D1
2. Weekly hire, aftermath, barter, healing, advancement UI against it
3. Play a real campaign for a few weeks; let the shape be wrong somewhere cheap
4. **Then** derive the migration from what's actually stored
5. OAuth, sessions, membership
6. Remote adapter and sync

Steps 1–3 are where the design gets corrected. Doing 4 first means migrating a
schema built on guesses.
