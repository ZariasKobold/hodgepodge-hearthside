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

---

### Session 4 — v0.4.0
Date: 2026-08-18

**feat: D1 schema and OAuth sign-in**

Deployed to Cloudflare Pages and confirmed live before starting.

**Routing fix, found while adding auth.** The register proxy was a catch-all at
`functions/api/[[path]].js`, which would have swallowed every `/api/auth/*`
request and forwarded it to BiggerHat. Moved to `functions/api/v1/[[path]].js`.
The client already called `/api/v1/...`, so nothing else changed. **Rule: keep
new API surfaces in their own namespace rather than under a catch-all.**

**Schema** (`migrations/0001_init.sql`) — ten tables, exactly as designed in
docs/data-model.md. `current_week` is absent by design; it derives from
`started_at` and the week length. `game_equipment` exists because attachment is
per-encounter. Injuries carry both `model_id` and `title_group` with the rule
that exactly one is set, or neither for the leader.

**Auth is OAuth-only and deliberately minimal.** Stored: provider,
provider_user_id, display_name, avatar URL. **No email, no password, no stored
token** — the access token reads the profile once and is discarded. Nothing to
leak, nothing to delete on request, no reset flow to build, no mail to send.
Discord first because wargaming groups already live there; Google is wired the
same way behind one config block.

Sessions are a random 32-byte id in an `HttpOnly; Secure; SameSite=Lax` cookie,
30 days, revocable server-side by deleting the row. Expired sessions are swept
on read rather than by a cron.

**Signed out is a first-class state.** `useAuth` degrades to signed-out when the
backend is absent — which is every `npm run dev` session, since Vite serves no
Functions. Accounts exist for *sharing* a campaign, never for *using* the app.
A login wall would also make people's data harder to rescue if Wyrd ever
revokes permission.

Files: wrangler.toml (new), migrations/0001_init.sql (new),
       functions/lib/auth.js (new), functions/api/auth/[provider].js (new),
       functions/api/auth/[provider]/callback.js (new),
       functions/api/auth/me.js (new), functions/api/auth/logout.js (new),
       functions/api/v1/[[path]].js (moved from functions/api/),
       src/hooks/useAuth.js (new), docs/SETUP_D1_AUTH.md (new),
       .gitignore, CLAUDE.md, package.json
RESOLVED: /api/auth/* would have been swallowed by the register proxy
UNVERIFIED: **all of it.** No D1 database exists yet, no OAuth app is
registered, and no auth code has ever executed. See docs/SETUP_D1_AUTH.md.
NEXT: complete the dashboard setup, then the remote storage adapter — campaigns
still live only in localStorage.

---

### Session 5 — v0.4.1
Date: 2026-08-18

**docs: bring CLAUDE.md current for a Claude Code handoff**

No code change. Development moves to Claude Code, where `CLAUDE.md` is loaded
automatically at the start of every session — so it has to carry everything a
fresh session needs without anyone remembering to explain it.

Added: live URL and repo name at the top; a repository map with one line per
folder explaining what it's for; the `src/`↔`functions/` import boundary as an
explicit rule; migrations-are-append-only; the OneDrive file-lock caveat; and
the double-configured D1 binding as known debt.

Restructured `⚠️ NEXT SESSION` into **Blocking** (three setup steps that must
happen before any feature work, with a concrete checkpoint for each),
**Next feature work** in priority order, and **Never verified** — which is now
its own heading because four separate things have been written and never
executed, and a fresh session would otherwise assume they work.

Commands section now states plainly that `npm run dev` serves no Functions and
no database, so `/api/*` failing there is by design rather than a bug to chase.

Files: CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: n/a
NEXT: `docs/SETUP_D1_AUTH.md` steps 1-5, then the weekly hire UI.

---

### Session 6 — v0.4.2
Date: 2026-08-18

**docs: correct three drifts found on the first Claude Code session**

No code change. First session run from Claude Code rather than Claude.ai; the
opening read of `CLAUDE.md` was checked against the actual tree, which is what
surfaced these.

**The D1 checkpoint was wrong, and wrong in the direction that matters.**
`⚠️ NEXT SESSION` said `/api/auth/me` returning `{"user":null}` proves `env.DB`
is bound. It proves nothing. `currentUser` opens with
`if (!sessionId || !env.DB) return null`, so a request with no session cookie
returns before it ever reaches the database — an unbound binding and a correct
one produce byte-identical responses. A checkpoint that passes in the failure
case is worse than no checkpoint, because it converts "unverified" into
"verified" without anything having been verified. Replaced with a `wrangler d1
execute` command that lists tables, which cannot pass unless the schema is
really there.

**Audit cadence retargeted from versions to sessions.** The trigger read
"every 10 versions (next scheduled: v0.3.10)". Written at v0.3.0, it assumed a
patch series that never happened — the next bump was v0.4.0, so v0.3.10 became
unreachable and the audit could never fire. Now counted from the numbered
session entries in this file, which increment by exactly one regardless of how
the version moves.

**`package.json` was stranded at 0.4.0** while the docs said 0.4.1. Session 5
listed `package.json` among its files but the bump never landed. Both are now
0.4.2.

**Cleared blocking item 3** (delete `functions/api/[[path]].js`) — already
done, the file is staged as deleted and the proxy lives at
`functions/api/v1/[[path]].js`.

**Not a drift, but worth recording:** `src/hooks/useAuth.js` briefly appeared
to be missing — `find` and a project-wide `grep` both returned nothing for a
file that was on disk. The directory mtime was three minutes *later* than the
file's. OneDrive had not materialised it at scan time. `CLAUDE.md` already
warns about OneDrive causing inexplicable build failures; add stale directory
listings to that warning. Re-check before believing a file is absent.

Files: CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: false D1 checkpoint; unreachable audit target; version mismatch
UNVERIFIED: unchanged — all auth code, every BiggerHat call, the register
proxy, `migrateLeaderToCampaign`. Nothing was executed this session.
NEXT: `docs/SETUP_D1_AUTH.md` steps 1-5, then the weekly hire UI. `useAuth`
exists but nothing imports it, so there is still no sign-in UI.

---

### Session 7 — v0.4.3
Date: 2026-08-18

**chore: D1 live, register proxy verified, dashboard binding proved unnecessary**

First session where deployed infrastructure actually ran. Three things that had
been written and never executed now have real results behind them.

**D1 exists.** Database created, `0001_init.sql` applied to both the local
sqlite copy and the remote database, ten tables verified remotely. The verify
listing also returns `_cf_KV`, which is Cloudflare's own internal table — the
count reads eleven and that is normal.

**The register proxy works.** `/api/v1/factions` returns real faction JSON from
BiggerHat in production. This is the first BiggerHat call in the project's
history to actually execute; every path before this was taken from their
OpenAPI spec on faith. The `/keywords/{slug}` shape is still unproven.

**The `/api/auth/*` routing fix is confirmed good.** Immediately after the push,
`/api/auth/me` on the custom domain returned the register proxy's
"Register returned 404." — the exact swallowing failure the v1 move was meant
to prevent. It was propagation: the domain was still serving the previous
deployment for a few seconds. The deployment-specific URL was correct the whole
time, and all three URLs now return `{"user":null}`. Worth recording because
the symptom is indistinguishable from the real bug, and the instinct is to go
rewrite routing that was never broken. **Check the deployment-specific URL
before believing a routing regression.**

**The D1 binding is NOT configured twice.** This was recorded as known debt —
`wrangler.toml` for the CLI, Pages dashboard for the deployed site, both must
agree. It is wrong. Tested by deploying a temporary diagnostic Function on a
throwaway branch that reported `Boolean(env.DB)` and a table count, at a moment
when *no dashboard binding existed at all*. It returned
`{"bound":true,"tables":11}`. `wrangler.toml` alone supplies the binding to
deployed Functions. The dashboard step is removed from SETUP_D1_AUTH.md and the
debt note is deleted from CLAUDE.md. Confirmed for Preview; Production uses the
same single block and will be proved end-to-end by the first sign-in.

The diagnostic Function and its branch were deleted after the result. It was
never merged to `main`.

**wrangler pinned as a devDependency.** `npm install -D wrangler` reports five
advisories including one critical; `npm audit --omit=dev` reports zero. All of
them are dev toolchain and none reach the browser bundle, so `audit fix --force`
would bump majors to silence something that does not ship.

Files: CLAUDE.md, package.json, package-lock.json, wrangler.toml,
       docs/SETUP_D1_AUTH.md, docs/VERSION_HISTORY.md
RESOLVED: D1 setup (blocking item 1); register proxy unverified; false
"configured twice" debt; false /api/auth/me binding checkpoint in the setup doc
UNVERIFIED: all auth code — the Functions deploy and route correctly and D1 is
reachable, but no OAuth round trip has run. `useAuth` is still imported nowhere,
so there is no sign-in UI. `/keywords/{slug}` still unproven.
NEXT: OAuth app registration (SETUP_D1_AUTH.md steps 4-5), then the weekly hire
UI.

---

### Session 8 — v0.4.4
Date: 2026-08-18

**feat: sign-in control — `useAuth` wired through App to a badge in the masthead**

`useAuth` existed but nothing imported it, so there was no way to reach the
OAuth flow from the interface and no way to test it once registered. This adds
the smallest control that closes that gap.

**The hook is called once, in `App.jsx`, and passed down.** Calling it inside
the badge would have been less plumbing, but every component that called it
would fire its own `/api/auth/me`. The storage adapter will need the same user
shortly, and `App` already owns `leader` and `roster` and hands them down — so
one call at the top matches how the rest of the app is wired.

**`AccountBadge` renders nothing when the backend is absent.** Not a disabled
button, not an error — nothing. `npm run dev` serves no Functions, so a sign-in
control there is a control that cannot work, and a dead button invites clicking.
It also renders nothing while the first `/api/auth/me` is in flight, because a
control that says "Sign in" and flips to a username a moment later reads as a
glitch. Verified both ways: under `wrangler pages dev` the button appears,
under `npm run dev` the masthead goes straight from the Hank toggle to the file
number and the wizard is fully usable.

**Styled at exactly the weight of the Hank toggle.** Same `--data` font, same
border, same size. Signing in is not an achievement the interface should
celebrate — it is a clerk noting who is at the counter. Accounts are for
sharing, never for using, and chrome that shouts undercuts that.

**Found while testing:** `beginOAuth` returns a clean
`501 {"message":"discord is not configured on this deployment."}` rather than a
stack trace when the secrets are missing. Good, but `signIn` navigates the whole
window, so the user lands on raw JSON with no way back. Filed as a low known
issue — it is also what someone sees if Discord itself is unreachable.

`.claude/launch.json` added so future sessions can start either server without
rediscovering that Functions need `wrangler pages dev dist` and a build first.

Files: src/App.jsx, src/components/Masthead.jsx,
       src/components/AccountBadge.jsx (new), src/styles/app.css,
       .claude/launch.json (new), CLAUDE.md, package.json,
       docs/VERSION_HISTORY.md
RESOLVED: useAuth imported nowhere; no sign-in UI to exercise OAuth
UNVERIFIED: the OAuth redirect and everything after it — callback, token
exchange, upsertUser, session creation, useAuth's signed-in branch. No account
has ever existed. The signed-in layout of the badge has therefore never
rendered with real data.
NEXT: register the Discord app (SETUP_D1_AUTH.md steps 4-5) and sign in once —
that single round trip verifies the callback, D1 writes, sessions, and the
badge's signed-in state together. Then the weekly hire UI.

---

### Session 9 — v0.4.5
Date: 2026-08-18

**chore: Discord client id into wrangler.toml, where Cloudflare now requires it**

Setting up the OAuth app surfaced the other half of session 7's finding.
`wrangler.toml` does not merely *also* work for configuration — for a Pages
project that has one, it is the **only** place plaintext variables can live.
The dashboard says so when you try: *"Environment variables for this project
are being managed through wrangler.toml. Only Secrets (encrypted variables) can
be managed via the Dashboard."*

So the two OAuth credentials go to different places, which is easy to get
wrong because they arrive together on the same Discord screen:

- `DISCORD_CLIENT_ID` → `wrangler.toml` under `[vars]`. Public by design; it
  travels in the authorize URL every signing-in browser can read. Committed.
- `DISCORD_CLIENT_SECRET` → dashboard, type **Secret**. Encrypted, unreadable
  after saving, never in a committed file.

`docs/SETUP_D1_AUTH.md` step 5 previously said to put both in the dashboard,
which would simply have failed for the id.

**Expectation for preview deployments:** the `[vars]` block is top-level, and
top-level config is known to reach preview builds here — session 7's diagnostic
ran on a *preview* deployment and had `env.DB` bound from the top-level
`[[d1_databases]]`. So the client id should reach preview too. Not directly
tested; the sign-in attempt will show it.

**Redirect URIs, recorded before it wastes an hour:** Discord matches exactly.
The registered `hodgepodge-hearthside.pages.dev` alias works; a per-deployment
subdomain like `c16b3590.hodgepodge-hearthside.pages.dev` does not and cannot
be registered, since it changes every build. Test sign-in from the branch alias
or the custom domain, never from a deployment URL.

Files: wrangler.toml, docs/SETUP_D1_AUTH.md, docs/VERSION_HISTORY.md,
       CLAUDE.md, package.json
RESOLVED: setup doc told you to put the client id somewhere that rejects it
UNVERIFIED: the OAuth round trip, still. Everything is now in place for it
except the secret, which only the user can enter.
NEXT: enter the secret in the dashboard, redeploy, then sign in once.
