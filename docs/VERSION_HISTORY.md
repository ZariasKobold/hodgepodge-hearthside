# Hodgepodge Hearthside — Version History

Why things were done the way they were. Feature sessions record what shipped;
audits record what drifted. Read this before an audit, and before changing
anything that looks arbitrary — it probably isn't.

Newest entries at the bottom.

---

### Session 1 — v0.1.0
Date: 2026-08-17

**feat: project scaffold, leader builder, campaign arithmetic**

Started from a generic character-generator spec and the *Index of the Untold*
campaign rules. The spec's five archetypes turned out to be lifted verbatim
from the book, so that step needed no adaptation.

**Key decisions and why:**

- **Wyrd's official Crew Builder already does crews, cards and in-game
  tracking.** It does not do campaign mode. Scope narrowed to the campaign
  layer, assuming the player has the official app open beside this one.
  Duplicating card lookup would be competing with a free first-party product.
- **Store pointers, not rules text.** `src/lib/indexing.js` drops every
  `description` field. Kept: model name, cost, faction, keywords, and the
  *names* of actions and abilities — exactly what the legality rules need.
  Two reasons: Wyrd gives the card library away free to sell cards, and card
  text changes with errata while names and costs don't.
- **Validation split in two.** `checkStructure` needs only the archetype;
  `checkSource` needs the register. This is why the wizard works with zero
  data loaded and degrades to typed entry instead of dead-ending.
- **`cost > 0` for the master/totem exclusion, not `station`.** The register
  returns `station: null` on records that clearly should have one (Mossbeard
  generates stones and is plainly a Henchman). Masters have no cost, so the
  cost check catches them regardless.
- **`lib/` imports nothing from React.** Campaign arithmetic was fully tested
  before any UI existed. Kept as a rule.
- **Vite, for the dev proxy.** A browser calling BiggerHat cross-origin is
  blocked by CORS. `server.proxy` moves the request server-side. This does not
  exist in production — see v0.2.0.

**Rules gap found:** the weekly hire is mandatory and the first model each week
costs 5 fewer scrip, so a 3-cost first hire computes to −2. The book never says
what happens. Resolving as a refund would be an infinite scrip engine. Floored
at zero, surcharge applied before discount, both exposed as house rules.

Files: full scaffold — `src/{data,lib,hooks,components,styles}`, `scripts/seed.mjs`,
       `vite.config.js`, `README.md`
RESOLVED: n/a (initial)
UNVERIFIED: every network call. Paths come from BiggerHat's OpenAPI spec, not a
live response.
NEXT: narration, then the campaign object.

---

### Session 2 — v0.2.0
Date: 2026-08-17

**feat: Hank, the Pages Function, and the D1 data model**

**Narration.** The app is now narrated by Hank, the Hodgepodge Emissary, with
his donkey Henrietta and an unlicensed surgeon, Dr. Morbidius Spiritstitch
("Dr. Mo"). ~240 lines in `src/data/hank.js`, mirrored in
`docs/hank-dialogue.md` with reference numbers (`L-03`, `BA-07`).

He is not decoration: a campaign leader is assembled from actions borrowed off
allies, so the narrator and the mechanic are the same idea.

**The timing rule — the most important lesson of the session.** The first
dialogue draft had Hank reacting to wins, losses and injuries *on arrival* at
the aftermath. The app doesn't know any of that yet — injuries come out of
flips partway through. Every pool was restructured into moments keyed to what
the app actually knows when the line renders. This now governs all future
dialogue and is §2 of CLAUDE.md.

**Two proxies, not one.** `vite.config.js` handles `/api` in development only.
`functions/api/[[path]].js` is the production equivalent — a Cloudflare Pages
Function that fetches upstream at the edge and caches an hour, so a hundred
players in one keyword hit BiggerHat once. If the API base path changes,
change both; a mismatch works perfectly in dev and fails only once deployed.

**Legal position clarified.** Wyrd's Fan Site and Art Policy permits this.
Binding conditions: non-commercial (no ads, no tiers), freely public, required
disclaimer on every page, no Wyrd mark in the domain, no trade dress. Permission
is revocable at any time — which is why JSON export is a requirement, not a
nicety. Named `Hodgepodge Hearthside`; hodgepodgehearthside.com secured.

**Data model designed** (`docs/data-model.md`) against Cloudflare D1. Supabase
was ruled out — its free tier caps *projects* at 2 and both are in use. D1 free
allows 10 databases per account, 500 MB each, and caps a Worker invocation at
50 queries, which is what forces set-fetches over per-model loops.

**Three schema errors caught by reading the book rather than by playtesting:**

1. **Equipment attachment was on the equipment row.** Wrong — attachment is
   chosen fresh at the Hire Crew step of every encounter. Moved to
   `game_equipment`. This also silently broke campaign rating, which counts
   equipment *selected when hiring*.
2. **Titled models.** One hire adds every version at one price; all versions
   share injuries. Injuries now attach to `title_group`, the only shape that
   can't drift. Emissaries and Effigies are the stated exception.
3. **`current_week` was a stored counter.** Replaced with `started_at` +
   `week_length_days`, derived on read. A counter is only right if someone
   presses a button on the right day, and every player's app disagrees when
   they don't. `week_offset` handles skipped weeks.

**Aftermath fully specified** from pp.20-36 — six ordered phases. The fate deck
is **not reshuffled between phases**, so a black joker spent on barter can't
reappear on injuries: the UI must walk one stateful sequence, not six screens.
Added `payday`, `injuryFlipCount`, `isAnnihilated`, `AFTERMATH_PHASES`;
corrected `aftermathHandSize` for early withdrawal.

Note the deliberate asymmetry: the soulstone bonus caps at +3, the scrip bonus
for lower campaign rating does not. That's what the book says. A test asserts
it so it reads as a decision, not a bug.

Files: src/data/hank.js (new), src/hooks/useHank.jsx (new),
       src/components/HankSays.jsx (new), functions/api/[[path]].js (new),
       docs/hank-dialogue.md (new), docs/data-model.md (new),
       CLAUDE.md (new), docs/VERSION_HISTORY.md (new),
       src/lib/campaign.js, src/lib/campaign.test.js (14 → 23 tests),
       src/components/{Masthead,SelectionSlot}.jsx,
       src/components/steps/*.jsx, src/App.jsx, src/styles/*.css,
       package.json, index.html, README.md
RESOLVED: production CORS (Pages Function); three schema errors; aftermath shape
UNVERIFIED: the Pages Function has never been deployed. Every BiggerHat call is
still unexecuted.
NEXT: build the `Campaign` object — everything else hangs off its shape, and it
must land before anyone saves data.

---

### Session 3 — v0.3.0
Date: 2026-08-18

**feat: the Campaign object**

`useLeader` modelled one leader with faction, keywords and arsenal hanging off
it. Everything after creation needs several arsenals plus a shared week log,
because the rules require players to see each other's numbers — max encounter
size is `min(both arsenals) + 6` and the soulstone bonus compares ratings.

Split into two files on purpose: `campaign.js` stays pure arithmetic,
`campaignShape.js` holds the object, factories, selectors and migration.

**Nothing derived is stored.** Current week, arsenal totals, campaign ratings
and injury counts are computed on read. A stored copy goes stale the moment an
injury lands, and every player's device would disagree.

**Decisions worth keeping:**

- **`currentWeek` is derived from `startedAt` + `weekLengthDays`.** A stored
  counter is only correct if someone presses a button on the right day.
  `weekOffset` lets an organizer claw back a week nobody played.
- **`totalFor` excludes annihilated models.** They can't be hired, so they
  can't count toward the total that caps encounter size.
- **Injuries resolve against `titleGroup` first, then `modelId`, then the
  leader.** Every version of a titled model shares injuries; storing once
  against the group is the only shape that can't drift. Tested both directions.
- **`ratingForGame` takes the game, not the arsenal.** Rating counts equipment
  *selected when hiring*, so an arsenal owning three pieces but taking two
  rates as two. The book's worked example (2 + 2 − 1 = 3) is a test.
- **A `leader` adapter kept the wizard working.** `useCampaign` exposes the same
  flat surface `useLeader` did, so the four step components needed no changes.
  Logged as Medium debt — retire it once the wizard reads the arsenal directly.

**Migration.** `migrateLeaderToCampaign` lifts a v0.1 saved leader on first
read: arsenal-level fields move off the leader, the starting arsenal becomes
week-one models. `schemaVersion` is on the object so future bumps chain in one
place rather than scattering version checks.

Files: src/lib/campaignShape.js (new), src/lib/campaignShape.test.js (new),
       src/hooks/useCampaign.js (new), src/hooks/useLeader.js (deleted),
       src/App.jsx, CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: single-leader shape; storage shape settled before any data was saved
UNVERIFIED: `migrateLeaderToCampaign` is tested against a synthetic record; it
has never run against a real saved leader from a browser.
NEXT: wire the weekly steps — hire first, since it fires eleven times a campaign
and both its arithmetic and its narration are already written.
