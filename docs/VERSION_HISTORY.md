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
The registered `hodgepodge-hearthside.pages.dev` is the PRODUCTION alias, not a
preview one — the bare `<project>.pages.dev` host serves the live deployment.
(Corrected in session 11; this entry originally called it a branch alias, which
is wrong.) Preview builds are at `<branch>.` and `<hash>.` subdomains, neither
registered, so preview sign-in does not work at all. Test sign-in from the
custom domain.

Files: wrangler.toml, docs/SETUP_D1_AUTH.md, docs/VERSION_HISTORY.md,
       CLAUDE.md, package.json
RESOLVED: setup doc told you to put the client id somewhere that rejects it
UNVERIFIED: the OAuth round trip, still. Everything is now in place for it
except the secret, which only the user can enter.
NEXT: enter the secret in the dashboard, redeploy, then sign in once.

---

### Session 10 — v0.4.6
Date: 2026-08-18

**Sign-in works. Setup is complete and the blocking list is empty.**

A real Discord account signed in to the deployed site. Everything between the
button and the database ran for the first time: consent screen, callback, token
exchange, `upsertUser`, the D1 write, session creation, and `useAuth`'s
signed-in branch rendering an avatar and name in the masthead.

Verified in the remote database afterwards rather than trusting the UI: one
`users` row (`provider: discord`, `display_name: Zarias`, avatar stored) and one
`sessions` row expiring in 29 days, which is the 30-day window behaving.

**The privacy claim is structural.** `pragma_table_info('users')` returns
exactly `id`, `provider`, `provider_user_id`, `display_name`, `avatar_url`,
`created_at`. No email column, no password column, no token column. There is
nowhere for that data to land even by mistake — worth knowing, because "we
don't store it" is a promise that decays and "there is no column" does not.

**The one failure on the way, and it was the predicted one.** Discord returned
*Invalid OAuth2 redirect_uri* because the redirect had not been saved in the
app's Redirects list. Diagnosis took one request: production already returned a
correct `302` carrying the right client id and a `state` param, which localised
the fault to Discord's config rather than ours — and confirmed as a side effect
that `DISCORD_CLIENT_ID` reaches production from `wrangler.toml` `[vars]`,
which had been an inference until then. **When OAuth fails, read the outbound
redirect first; it separates our bug from their config in one look.**

Naming the Discord app *Hodgepodge Hearthside* rather than something like
"OAuth2" paid off at the consent screen, which reads "Hodgepodge Hearthside
wants to access your Discord account". Players are being asked to hand over
account access to a fan project; looking legitimate is most of that ask.

Files: CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: the entire blocking list — D1, OAuth registration, and the auth code
that had never run
UNVERIFIED: `logout` has never been called, session expiry sweeping has never
fired, Google as a provider is unwired, and nobody has signed in from a preview
deployment. `/keywords/{slug}` remains the last unproven BiggerHat shape.
`migrateLeaderToCampaign` is still synthetic-only.
NEXT: the weekly hire UI — highest value, fires eleven times a campaign, both
halves already written and tested. Needs the `.gap-note` for the negative-scrip
house rule, visible in both Hank modes.

---

### Session 11 — v0.4.7
Date: 2026-08-18

**docs: correct the preview sign-in claim, and record sign-out as verified**

Sign-out was exercised: the session row is deleted, the cookie cleared, and the
badge returns to signed out. Two more items off the unverified list.

**Correction.** Sessions 9 and 10 described
`hodgepodge-hearthside.pages.dev` as a branch alias that would let preview
deployments sign in. It is the **production** alias — the bare
`<project>.pages.dev` host serves the live deployment. Preview builds are at
`<branch>.` and `<hash>.` subdomains, neither of which is registered with
Discord, so preview sign-in does not work at all rather than partially. The
error came from testing that host, getting production's response, and reading
it as evidence the preview path was covered.

This matters at the remote storage adapter and not before. That feature is
entirely signed-in behaviour, so testing it without preview sign-in means
exercising writes against the live database from the live site — which is the
one place you do not want to debug a sync bug. `docs/SETUP_D1_AUTH.md` now
carries the three steps: standardise on a long-lived branch name, register that
one redirect, and add the secret to the Preview environment separately.

The per-build `<hash>.` host can never be registered, since it changes every
deployment. That part was right.

Files: CLAUDE.md, docs/SETUP_D1_AUTH.md, docs/VERSION_HISTORY.md, package.json
RESOLVED: sign-out unverified; a wrong claim about which hosts can sign in
UNVERIFIED: session expiry sweeping, Google as a provider, preview sign-in
(now correctly described as unconfigured rather than untested).
`/keywords/{slug}` and `migrateLeaderToCampaign` unchanged.
NEXT: the weekly hire UI.

---

### Session 12 — v0.4.8
Date: 2026-08-18

**feat: play is gated behind sign-in — `SignInGate` closes the wizard**

Owner decision, taken against the recommendation recorded here, and it reverses
a founding rule. `CLAUDE.md` §12 and `docs/data-model.md` both said accounts
were for *sharing*, never for *using*, and that play must never sit behind a
login. Both are rewritten rather than quietly left to rot — a doc that
contradicts the code is worse than no doc.

**What was argued and overruled**, kept because the trade is now permanent and
someone will ask why: nothing was being lost without an account (`storage.js`
already persists locally and exports to JSON), and gating buys no association
yet because no Function writes campaigns to D1 — the only D1 writes that exist
are `users` and `sessions`. The alternative offered was ungated play with a
claim-on-sign-in step, which reaches the same end state without turning away
anyone who wants to try before registering.

**The cost is concentrated in one place: an outage now blocks play entirely.**
Previously any network failure degraded to local storage and game night
continued. So the gate carries three obligations, all implemented and verified:

1. **Nobody gets stranded.** `SignInGate` reads existing local storage and
   offers a JSON export from the gate itself. Someone who built a leader before
   this change can still get it out.
2. **The disclaimer renders on the gate.** §8 requires it on every page, and
   the gate is now the first page most people see.
3. **No dead buttons.** When the backend is unreachable the screen says so and
   names the cause, rather than offering sign-in that cannot work.

**Local development would otherwise be impossible**, since Vite serves no
Functions and localhost has no registered redirect URI — so the wizard would be
permanently closed while developing it. `VITE_ALLOW_UNAUTHENTICATED=true` in
`.env` opens it, and **only** when the backend is genuinely absent. It cannot
open a signed-out session in production, where `available` is true, and
deployed builds never carry the flag because it lives in `.env` and is not
among `wrangler.toml`'s `[vars]`.

Verified all three states in a browser rather than by reasoning: signed out
under `wrangler pages dev` shows the gate and no wizard; no backend under
`npm run dev` shows the unreachable notice; with the flag set the wizard opens
normally. The step rail is hidden while gated — a progress bar for a wizard you
cannot enter.

Files: src/App.jsx, src/components/SignInGate.jsx (new),
       src/components/Masthead.jsx, src/styles/app.css, .env.example,
       CLAUDE.md, docs/data-model.md, docs/VERSION_HISTORY.md, package.json
RESOLVED: n/a
UNVERIFIED: the gate has never been seen by a signed-out visitor on the
deployed site — only locally. Campaigns are still not written to D1, so the
gate's stated purpose is not yet delivered; that arrives with the remote
storage adapter.
NEXT: the remote storage adapter is now the load-bearing feature rather than
item 3 — until it lands, players sign in and still store everything locally.
Preview sign-in (`SETUP_D1_AUTH.md`) becomes worth configuring at the same time.

---

### Session 13 — v0.4.9
Date: 2026-08-18

**feat: the weekly hire — first of step 2's five screens**

Taken in the build order from `docs/data-model.md` §11, which we had run out of
sequence: the migration and OAuth were built before any of the weekly UI, and
the schema has still never been corrected by real play. Step 2 is that
correction, and the hire is its highest-value piece — it fires eleven times a
campaign.

**A trap found before building on it.** `hireCost` reads
`houseRules.allowNegative`; a campaign stores `allowNegativeHireCost`. Passing
`campaign.houseRules` in raw would have silently ignored the rule — no error,
just the floored price forever, which is exactly the class of bug the tests
exist to catch and wouldn't have. Added `hireRules()` to translate, with a test
that asserts the raw object lacks the key `hireCost` actually reads. Also added
`isOutOfKeyword` and `hiresInWeek`. Tests 45 → 53.

**Two top-level views now, not more wizard steps.** Creation happens once;
the campaign repeats for twelve weeks. Folding the hire in as step 5 would have
implied it was part of building a leader. Aftermath, barter, healing and
advancement go beside it in the Campaign view.

**The timing rule held.** The greeting knows only the week and the scrip on
hand, so it speaks to those; the reaction waits for a model, because until one
is chosen there is no cost to react to. Verified live: with 0 scrip the broke
variant fires, and Hank's first-hire line stays inside §3 — "that's just how
the road works", never a discount he granted.

**The rules gap is surfaced twice, deliberately.** A standing `.gap-note`
explains the floor before it matters, and a second one appears only when it
actually bites, naming the number the discount would have produced. Both use
`.gap-note` rather than `<HankSays>`, so switching the narration off does not
hide them (§5).

Verified by driving the browser rather than by reasoning: a 3-cost first hire
quotes `3 → −5 → 0` with the floor explained; a second hire the same week loses
the discount and quotes 4; unaffordable renders the can't-afford line and the
button is genuinely `disabled`.

Files: src/components/steps/WeeklyHire.jsx (new), src/App.jsx,
       src/components/Masthead.jsx, src/lib/campaignShape.js,
       src/lib/campaignShape.test.js, src/styles/app.css, CLAUDE.md,
       package.json, docs/VERSION_HISTORY.md
RESOLVED: weekly hire UI; the silent house-rule name mismatch
UNVERIFIED: the register-backed path — every live test used manual entry, since
`npm run dev` cannot reach BiggerHat. Versatile detection reads
`characteristics`, which no register response has ever been observed to carry;
the checkbox exists so a wrong guess is correctable rather than binding.
NEXT: aftermath — six ordered phases, ONE stateful flow, not six screens. Then
barter, healing, advancement.

---

### Session 14 — v0.5.0
Date: 2026-08-22

**feat: rules text shown live, searchable keywords, image/PDF export, crew cards**

Five changes, one of which required breaking a standing rule and so was put to
the owner before any code was written.

**§4 was amended, not overridden.** The rule read "never add a field that
carries rules text". BiggerHat does serve it — `description` on every action,
trigger and ability, plus range/stat/damage — so the feature was possible; the
question was whether it should be. §4 gave two reasons and they came apart
cleanly under inspection:

- *Errata would make us the maintainer.* Fully preserved. `src/lib/rules.js`
  holds text in a module-level Map that dies with the tab. Nothing reaches
  localStorage, the JSON export, or D1. An errata takes effect on the next page
  load because there is nothing to go stale.
- *It competes with the funnel that sells cards.* Not a technical question, so
  it was the owner's to answer. Answered yes-with-limits, noting BiggerHat
  already republishes the same text publicly under the same fan policy.

The boundary now in §4: **fetch and display, never persist.** `toIndexedModel`
and `toCard` are near-identical on purpose — one lossy, one not — and everything
that persists still travels the lossy path. They must not be merged.

**Bounded auto-load, unbounded behind a button.** The record's selections come
from at most four models, so their text is fetched without being asked for. An
arsenal grows for twelve weeks, so crew cards wait for a click. Same register,
different blast radius; the button is also the honest signal that this needs
BiggerHat to be up.

**Keyword entry is two comboboxes now.** The old arrangement was one shared
search box plus a slot selector, which made the player track which slot the box
was pointed at. Each slot owns its input. Real listbox semantics, so arrow keys
and Enter work; falls back to typed slug entry when search fails, because the
register is allowed to be down (§6).

**Hover text, two different mechanisms, for one concrete reason.** Chosen picks
get a floating popover. Candidate rows get a panel *below* the scroller instead
— an absolutely-positioned tip inside an `overflow-y: auto` list is clipped by
its own container. The panel also holds still while you keep browsing. Both
trigger on focus as well as hover.

**PNG is drawn on a canvas, not screenshotted.** No rasteriser dependency added
to a project that ships React and nothing else, and the sheet is laid out for
paper rather than inheriting the window width. Measuring and painting are one
pass, so the two cannot disagree about where a line broke. PDF goes through the
print dialogue — every browser has a competent PDF writer behind "Save as PDF",
and the print stylesheet had to exist for paper anyway.

**Wyrd's disclaimer follows the exports.** §8 requires it on every page and an
exported file is a page that outlives this app. It is drawn into the PNG and
rendered print-only inside `.record` and every `.crewcard` (each starts its own
printed page). `LEGAL` is now one constant; the colophon uses it too.

**Two bugs found by driving the browser, not by reading:**

- `useRules` guarded its async results with an `alive` ref cleared on unmount.
  StrictMode mounts, tears down and remounts in development, so the flag stayed
  false after the second pass and *every* response was silently discarded — the
  panel sat on "Reading the register…" forever. The flag is now set on the way
  in as well as cleared on the way out.
- `exportJSON` revoked its object URL on the line after `anchor.click()`, which
  races the download the click just started. Downloads folder had a stalled
  `cletus-and-duke-carcinus.json.crdownload` from the owner's own session as
  evidence. Now a shared `downloadBlob` helper attaches the anchor and revokes
  on a timer. The image export uses the same path.

**The `{{icon}}` vocabulary is small, closed, and typo-ridden.** Sampled ~1000
actions/abilities/triggers: 21 distinct tokens, of which `{{missle}}`,
`{{{pulse}}`, `{{saction}}` and `{{stone-}}` are upstream typos. The parser is
deliberately forgiving and renders an unknown token as a word rather than
leaking braces. Icons are rendered as spans, never `dangerouslySetInnerHTML` —
the text is someone else's and arrives over the network.

On the card a glyph touches its measurement (`{{pulse}}2"`); spelled out as a
word that reads as "Pulse2", so a space is reinserted for multi-character
labels and withheld for `+` and `−`.

**Verified live against BiggerHat, not reasoned about.** Keyword search by mouse
and by keyboard; a full leader built; hover text on both mechanisms; the record
writing out four selections with stat lines and triggers; three crew cards
loaded; the PNG exported and its ink profile measured (margins land at exactly
54px both sides, ink spans every band, nothing overflows). Then `fetch` was
stubbed to fail: the record falls back to names and costs, the footer reverts to
"Rules text lives on your cards", each entry shows the register error, and all
three export buttons still work.

Tests 53 → 78.

Files: src/lib/rules.js (new), src/lib/rules.test.js (new),
       src/lib/recordImage.js (new), src/hooks/useRules.js (new),
       src/components/Combobox.jsx (new), src/components/RulesText.jsx (new),
       src/components/CrewCards.jsx (new), src/components/SelectionSlot.jsx,
       src/components/ui.jsx, src/components/steps/Identity.jsx,
       src/components/steps/Loadout.jsx, src/components/steps/Record.jsx,
       src/lib/storage.js, src/App.jsx, src/styles/app.css,
       CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: the BiggerHat "never verified" bullet — the thin-record second-fetch
path in useRoster.js was the unproven branch and it is the one that runs;
the StrictMode discard bug; the stalled-download bug (also fixes JSON export)
CORRECTED: v0.4.9 claimed `npm run dev` cannot reach BiggerHat. It can — that
is what the Vite proxy in `vite.config.js` is for. Only Functions and D1 are
absent locally.
UNVERIFIED: printing to actual PDF (the preview browser cannot open a print
dialogue, and it does not complete downloads to disk either — the PNG blob was
validated in-page instead). `/strategies` and `/schemes` still never called.
NEXT: an audit is due (18 files, a new shared module, and a changed rule), then
aftermath — six ordered phases, ONE stateful flow, not six screens.

---

### Session 15 — v0.5.1
Date: 2026-08-22

**feat: Versatile models are hirable from the declared faction**

Reported from a table: during arsenal building you could not hire your
faction's Versatile models. The *cost* rule for them already existed —
`hireCost` has exempted Versatile from the out-of-keyword surcharge since
v0.4.0 — but the models never reached the roster, because `useRoster` only ever
fetched the two declared keywords. The rule was right and unreachable.

**Two pools, one load.** `useRoster.load({ keywords, faction })` replaces
`loadKeywords`. Keywords work as before; the faction's Versatile models come
from `/characters?faction=X`, which is **two requests for a whole faction**
because that index carries `characteristics` and `keywords`. The keyword index
carries neither — which is exactly why v0.4.9 concluded "no register response
has ever been observed to carry characteristics" and shipped a checkbox to
compensate. That conclusion was drawn from the only endpoint then in use, and
it was wrong about the register as a whole.

**Three register traps, all silent failures:**

- `per_page` must be sent on **every** page. Omitted on page 2, the server
  re-serves the tail of page 1 instead of erroring. The first Neverborn pull
  looked like 115 rows and was actually 100 with 15 duplicates.
- Faction slugs diverge: the register wants `ten_thunders` and
  `explorers_society`; ours are hyphenated and cannot be renamed, because they
  are written into saved campaigns. An unknown faction returns **zero rows, not
  an error** — so a Ten Thunders player would have seen an empty Versatile pool
  with nothing anywhere looking broken. Hence `registerSlug` in
  `src/data/factions.js`, explicit rather than a `replace('-','_')`, and a test
  asserting no mapped slug ever contains a hyphen.
- `/characteristics/versatile` returns only `{id,name,slug}` — no members. The
  characteristic list cannot be used to find the models that have it.

**Versatile governs hiring, not leader selection.** Putting these models into
the roster risked quietly widening what a leader could take their action or
ability from. It does not: `checkSource` still demands keyword overlap, so a
Versatile model with no shared keyword is filtered out of `candidatesFor`. That
is now locked down by test, using a 3ss model rather than Teddy — at 10ss Teddy
is rejected on price before keyword is ever consulted, so it would have proved
nothing. Verified live too: 14 Versatile models in the roster, zero of them
offered as selection candidates.

**A latent bug the fix made reachable.** The hire screen's Versatile checkbox
was `versatile || detectedVersatile`. While detection never fired, that was
harmless. Now that it does, unticking the box did nothing at all — the OR put
it straight back. It is tri-state now: `null` follows the register, `true`/
`false` is the player overriding it, because a hand-typed hire carries no
characteristics and the player is the one holding the card.

**The campaign view could not load the register at all.** `WeeklyHire` read
`roster.models` but nothing there ever populated it; it only worked if you had
passed through the loadout step this session. Resuming a campaign left the
Versatile pool permanently unreachable. It has its own load button now.

**Both pickers group rather than merge.** A Versatile model appearing beside
your keyword models needs to read as a rule, not a bug, so the arsenal and hire
selects use optgroups: "From your keywords" and "Versatile — <faction>".

Verified live: 28 models loaded (14 keyword, 14 Versatile Neverborn); two
Versatile models hired into the starting arsenal; zero leakage into leader
selections; Teddy quoted at 10 − 5 = 5 scrip with no surcharge and the box
pre-ticked "(the register says so)"; unticking moved it to 10 + 1 − 5 = 6 and
reticking moved it back; and the campaign view's load button populating both
groups from a cold page load.

Tests 78 → 90.

Files: src/lib/indexing.js, src/lib/indexing.test.js (new), src/lib/api.js,
       src/data/factions.js, src/hooks/useRoster.js,
       src/components/steps/Loadout.jsx, src/components/steps/Record.jsx,
       src/components/steps/WeeklyHire.jsx, CLAUDE.md, package.json,
       docs/VERSION_HISTORY.md
RESOLVED: Versatile models unhirable; the dead Versatile checkbox; the campaign
view having no way to load the register
CORRECTED: v0.4.9's claim that no register response carries `characteristics`.
The faction index does; the keyword index does not.
UNVERIFIED: only Neverborn and Ten Thunders faction pulls have run. The other
six use the same code path and the slug map is tested, but no live call.
NEXT: the audit is still due, then aftermath.

---

### Session 16 — v0.5.2
Date: 2026-08-22

**fix: a leader does not inherit the source model's triggers**

Spotted on an exported record: the leader's actions were printing the *source
model's* triggers. Taking an ally's action does not bring its triggers with it
— those are earned in campaign play or granted at creation, and only the Heavy
Hitter is granted one. The record was showing a Schemer four triggers it did
not have.

This is a v0.5.0 bug, and specifically a bug of the kind that showing rules text
invites: the register hands back an action with its triggers attached, and
rendering "what came back" is not the same as rendering "what this leader has".
The names-and-costs record could not have had this bug, because it never showed
enough to be wrong.

**`showTriggers`, defaulting to on, switched off where the reader is a leader.**

| Where | Triggers | Why |
|---|---|---|
| Leader record + PNG/PDF | off | the leader does not have them |
| Loadout, attack slot, Heavy Hitter | on | one is about to be chosen from them |
| Loadout, everywhere else | off | none is up for grabs |
| Crew cards | on | that *is* the hired model's own card |

**The kept trigger gained its text.** Previously the Trigger section printed a
bare name. Now it resolves back through the attack pick's source card and prints
the suit and rules text — "Free Loot — on Sword / Tome / Remove a Scheme marker
within 2" of this model." That trigger the leader genuinely holds, so writing it
out is the same call §4 already made for actions.

**A test asserted the bug.** v0.5.0's `buildSheet` test checked
`attack.triggers[0].title === 'Ram — Critical Strike'`, encoding the wrong rule
as intended behaviour. Corrected, with a comment saying so, plus a dedicated
block covering: no triggers on pick entries, no Trigger section when none was
granted, the kept trigger with text and its parent action, the register-down
fallback to a bare name, and a hand-entered attack pick not throwing.

Resolution is deliberately **not** memoised in `Record.jsx`: the card arrives
asynchronously and `rules.card` reads through a module-level map, so any
dependency list would go stale the moment the fetch landed.

Verified live on both paths. Schemer: zero trigger lists on the record, action
text intact, no mention of Sinkhole, Friendly Waters, Typhoon or Troll the
Surface. Heavy Hitter: triggers visible when hovering an *attack* candidate and
absent on a *tactical* one, and the finished record carrying "TRIGGER / Free
Loot — on Sword / Tome / Remove a Scheme marker within 2" of this model." with
no trigger lists inside the actions. PNG still exports.

Tests 90 → 98.

Files: src/lib/rules.js, src/lib/rules.test.js, src/lib/recordImage.js,
       src/components/RulesText.jsx, src/components/SelectionSlot.jsx,
       src/components/steps/Record.jsx, CLAUDE.md, package.json,
       docs/VERSION_HISTORY.md
RESOLVED: source triggers printed on the leader's record; the bare-name Trigger
section; a test that asserted the wrong rule
NEXT: the audit is still due, then aftermath. Campaign-earned triggers are not
modelled at all — when advancement lands, `leader.trigger` will need to become
a list rather than a single string.

---

### Session 17 — audit of v0.5.2
Date: 2026-08-22

**audit: first full pass, 19 findings, none fixed**

No version bump and no code changed. The version stays at 0.5.2 deliberately —
the audit is *of* v0.5.2 and `docs/audits/audit-v0.5.2.md` encodes that in its
filename; bumping would make the document's name lie about what it examined.
Numbered here anyway, because §5's cadence counts entries in this file and a
skipped number would drift the next scheduled audit.

Full catalogue in `docs/audits/audit-v0.5.2.md`. Summary: **1 high, 8 medium,
10 low.**

**The method change worth keeping.** An exported PDF from a real session was
available this time, and reading it found three defects (M3–M5) that were
invisible in the source: a "Refresh crew cards" button printed into the PDF, a
page containing nothing but the legal disclaimer where `.record__foot` split at
a page boundary, and the same Swashbuckler printed twice because `CrewCards`
maps arsenal entries rather than distinct models. Next audit: **export the
artefacts and read them**, not just the code.

**The two that block Aftermath:**

- **H1** — `SignInGate` tells a locked-out user "you can import it once you're
  signed in". There is no import. `importJSON` exists in `storage.js` and is
  referenced by nothing; there is no file input anywhere in `src/components/`.
  The sentence sits next to the export button on the one screen shown to people
  who cannot get into the app.
- **M1** — `Record.jsx` writes `{slug, name, cost}` straight into
  `arsenal.models`, bypassing `createModel`. So the starting arsenal and the
  weekly hires are different shapes with the same name, and starting models have
  no `id`. Injuries key off `model.id`, so a starting model cannot be injured or
  annihilated — and phase 6 of Aftermath is injuries.

**On the cadence itself.** The §5 trigger fired at v0.5.0 and three feature
sessions ran before the audit did. Two of the mediums found here (M2, M3) were
introduced during that window. The trigger worked; the response to it didn't.
Recorded in the audit as: treat "audit due" as blocking the next feature rather
than as a note in the queue.

**What held.** `src/lib/` still imports nothing from React across all nine
modules including the three added since v0.5.0. `src/` and `functions/` still
do not import from each other. Nothing persists rules text — `rules.js` reaches
`storage.js` only for `downloadBlob`, and no `save()` call anywhere touches a
description. Migrations remain append-only.

**What drifted.** `hank.js` holds 241 dialogue strings and the doc's Counts line
agrees, but the doc body numbers only 230 — `SELECT_OPEN_BY_ARCHETYPE` (5),
`SELECT_TRIGGER` (3) and `ADVANCE_FIRST` (3) have no numbered entries at all.
And `AccountBadge.jsx` and `useAuth.js` still assert the pre-v0.4.8 rule that
nothing gates play, with `AccountBadge` citing `data-model.md §3` as authority
for a claim that document now marks superseded.

Files: docs/audits/audit-v0.5.2.md (new), CLAUDE.md, docs/VERSION_HISTORY.md
RESOLVED: nothing — this is a catalogue, per §5 ("catalogue findings by
priority **before** writing fix code")
NEXT: owner picks what to fix. Suggested order is in the audit. H1 and M1 before
Aftermath; the three print defects are small and the PDF is now a deliverable
people hand round a table.

---

### Session 18 — v0.6.0
Date: 2026-08-22

**feat: a shelf of leaders, JSON import, and the audit's high + medium findings**

Two things at once: the owner asked for multiple leaders, and the v0.5.2 audit
findings were cleared. They belong in one session because H1 and M1 both live in
the storage layer the shelf rebuilt.

**A campaign per leader, not leaders per campaign.** The obvious shape — an
array of leaders — is wrong here, because a campaign's `arsenals` array is
already spoken for: it holds *other players*, since max encounter size is
min(both arsenals) + 6 and the soulstone bonus compares ratings. A second leader
of your own could never have lived there. So storage became a shelf:
`campaigns:index` (ids only), `campaign:<id>`, `campaigns:active`.

The index stores **no** leader name or faction. Those are derived, a copy goes
stale on a rename, and campaignShape's standing rule is that nothing derived is
stored. Drawing the shelf reads each campaign instead; there are a handful and
they are already local.

**Landing screen depends on whether there is anything to choose between.** Empty
shelf drops straight into creation, as before. Once anything is saved, the shelf
is the landing screen — after week one the question is which campaign, not
whether. Creation and Campaign only appear in the masthead while one is open;
offering them on the shelf would be offering to edit nobody.

**The legacy key is left where it is.** `adoptLegacyCampaign` copies the old
single `campaign:current` onto the shelf and does not delete it. If the lift
goes wrong, the only copy of somebody's twelve weeks is still where it was. That
paid off within the hour: a bad first migration was undone by clearing the shelf
keys and reloading.

**H1, built rather than reworded.** The gate had been telling locked-out users
they could import their export once signed in, and there was no import. There is
now, on the shelf. An import is filed as a **new** leader with a fresh id, so
importing the same file twice gives two campaigns and nothing on the shelf can be
lost by importing.

**M1, plus a regression it caused.** `Record.jsx` now goes through `createModel`,
and `migrate` repairs stored campaigns at schemaVersion 2. The first cut filed
the starting arsenal under week 1 — which made five starting models look like
five weekly hires, and `isFirstOfWeek` false, quietly eating the 5-scrip
first-of-week discount for a genuine week-1 hire. Caught in the browser, not in
review. It is `STARTING_ARSENAL_WEEK` (0) now, and the migration identifies
starting models by the absence of `addedWeek` — weekly hires always went through
`createModel` and carried one, so only the wizard's bare writes lack it.

**M6 was withdrawn.** The audit claimed `hank-dialogue.md` numbered only 230 of
241 lines. It does not; it numbers all 241. The finding came from a counting
regex that assumed every code looks like `S-04`, and the doc uses three formats
plus descriptive suffixes on the creation entries. Fourteen real entries were
silently dropped by the pattern. The retraction is kept in the audit rather than
deleted, because the next person to run the obvious regex will get the same
wrong answer and should find the note first.

**One more trap worth writing down.** `createCampaign` spreads its patch last,
so `createCampaign({ ...incoming, id: undefined })` overwrites the id it just
minted, and `saveCampaign` then no-ops on the missing id — silently, with no
error. Import appeared to do nothing. Strip the key rather than blanking it.

Verified live end to end: the legacy campaign adopted onto the shelf with its
old key intact; the card showing faction, archetype, week, keywords, model
count, cost and scrip; *View arsenal* opening it; *Build a new leader* creating
a second; import producing a distinct second entry with its models intact;
discard confirming by name before removing; and the hire ledger reading "no hire
required" rather than "5 hired this week".

Tests 98 → 107.

Files: src/components/ArsenalLibrary.jsx (new), src/hooks/useCampaign.js,
       src/lib/storage.js, src/lib/campaignShape.js,
       src/lib/campaignShape.test.js, src/App.jsx, src/components/Masthead.jsx,
       src/components/SignInGate.jsx, src/components/AccountBadge.jsx,
       src/hooks/useAuth.js, src/hooks/useRules.js,
       src/components/CrewCards.jsx, src/components/steps/Record.jsx,
       src/styles/app.css, docs/audits/audit-v0.5.2.md, CLAUDE.md,
       package.json, docs/VERSION_HISTORY.md
RESOLVED: audit H1, M1, M2, M3, M4, M5, M7, L8; the starting-arsenal week
regression; the createCampaign id-blanking trap
RETRACTED: audit M6 — hank.js and hank-dialogue.md agree exactly
UNVERIFIED: printing the corrected PDF. The three print fixes are CSS and
`.noprint` classes verified in the DOM, but no dialogue has been opened here.
The owner's next export is the proof.
NEXT: aftermath. Ten low audit findings remain open, and the dialogue-count
script is still unwritten.

---

### Session 19 — v0.6.1
Date: 2026-08-22

**fix: Leaders is a view, not an exit — and "View arsenal" now opens an arsenal**

Two reports from the owner, both fair, both mine.

**Clicking Leaders emptied the masthead.** `onLibrary` called `close()`, which
nulled the open campaign, which unmounted Creation and Campaign. Glancing at
your other leaders threw away your place. The shelf is a view now; opening a
different leader is the only thing that closes one.

**"View arsenal" went to the weekly hire.** There was no arsenal view to go to —
I had wired the button to the nearest existing screen and called it done. The
button was right and the screen was missing.

`steps/Arsenal.jsx` is that screen: the leader's record, a ledger (week, scrip,
soulstones, models, injuries when there are any), the roster **grouped by when
each model arrived**, annihilated models listed separately, and the crew cards.
It is deliberately read-only about the roster — models arrive through the
starting arsenal or the weekly hire and leave by annihilation, so a delete
button here would imply a fourth route the rules do not have.

**The record is now shared, not copied.** `LeaderRecord.jsx` is lifted out of
the creation wizard's last step so both views render the same document. Two
copies of that markup would have drifted within a session or two — the trigger
bug in v0.5.2 was exactly that kind of divergence between the screen and the
exporter.

Grouping the roster by `addedWeek` also made the v0.6.0 week-0 fix visible
rather than merely tested: the arsenal reads "Starting arsenal — 20ss" and
"Week 1 — 3ss" as separate groups, and a first hire in week one still quotes
`3 → −5 → 0`. Had the starting arsenal stayed at week 1, that hire would have
cost 3 and nothing on screen would have explained why.

Verified live: four tabs surviving a trip to the shelf and back; View arsenal
landing on the record rather than the hire screen; the roster gaining a "Week 1"
group after a hire; the discount still applying.

Tests unchanged at 107 — this is routing and presentation, and the arithmetic it
exercises was already covered.

Files: src/components/LeaderRecord.jsx (new),
       src/components/steps/Arsenal.jsx (new), src/App.jsx,
       src/components/Masthead.jsx, src/components/steps/Record.jsx,
       CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: Leaders closing the campaign; View arsenal opening the wrong screen;
the record markup existing twice
NEXT: aftermath. Ten low audit findings open; the dialogue-count script is still
unwritten; the corrected PDF is still unproven.

---

### Session 20 — v0.7.0
Date: 2026-08-22

**feat: campaigns sync to D1, and signing in adopts what you already built**

The owner asked whether data was in the database. It was not — and worse, the
sign-in gate said it was. Three claims on that screen were false: that a
campaign was "filed against an account rather than this browser", that it
"follows you to another device", and that it "survives clearing your history".
Clearing browser data lost everything and signing in elsewhere showed an empty
shelf. Same class of defect as audit H1, two screens away, and I had walked past
it twice.

**Local-first, deliberately lopsided.** localStorage stays the working copy and
is written synchronously; D1 is a mirror. Every failure is survivable and says
so on the shelf. This is what the roadmap meant by "local stays the fallback,
never a stepping stone" — the app with the network down behaves exactly as it
did before any of this existed.

**Adoption on sign-in**, which is what was asked for. `planSync` compares the
two shelves: remote-only pulls down, local-only pushes up, and where both have
a copy the newer `updatedAt` wins with ties keeping local. It is pure and has
eleven tests, because it is the only code in the path that can destroy twelve
weeks of somebody's campaign.

**On D1 and row-level security.** There is none. D1 is SQLite — no policy
engine, no `auth.uid()`. Supabase needs RLS because PostgREST exposes the
database straight to the browser; D1 never is, the binding exists only inside a
Function. So there is no anon key to leak, and in exchange **every
authorization decision is code we write**.

That distinction stopped being theoretical during testing. The first version
guarded each statement with `WHERE owner_user_id = ?`, which worked for the two
statements that had an owner column — and the `DELETE FROM arsenal_models` has
none, so it had no guard at all. A second signed-in account PUTting to someone
else's campaign id **deleted that player's model rows** while the guarded
statements silently did nothing, and the endpoint returned 200. Found by
attacking it with a forged local session, not by reading it.

The fix is one ownership gate before any write, because a single gate cannot be
forgotten on the one statement that looks different. Re-ran the attack: 404,
and the owner's three model rows, scrip and faction all intact.

**Two more bugs the testing found:**

- The offline warning never appeared. `useSync` skipped the update from `idle`
  to avoid a pointless render — silencing the "this browser only" notice on the
  one load where it mattered most.
- Every fresh device invented a blank leader and pushed it to the account. The
  auto-create effect read `sync.status` from render state, and on the commit
  where auth resolves `reconcile()` has been called but has not updated status
  yet, so the gate saw the old value and passed. `settled` is now derived from
  `at` — the timestamp of a *completed* reconcile — which is the question
  actually being asked. "Empty" and "not arrived yet" are different answers.

**Schema.** Migration 0002, append-only, adds `doc`, `schema_version` and
`updated_at` to `campaigns` plus an owner index. `doc` is the source of truth;
the normalized columns are a projection written on the same upsert so the server
can scope and list **without parsing JSON**, which is what matters for
authorization. `injuries`, `equipment` and `games` have tables in 0001 but are
unwritten and Aftermath will reshape them, so normalizing them now would be
guessing — they ride inside `doc` until then. Applied to the remote database
after confirming campaigns/arsenals/models held zero rows.

A full campaign write is four statements regardless of size: models go in one
multi-row INSERT, not one each. Well inside the 50-query cap.

Verified against a local D1 with a forged session, since no preview redirect URI
exists for Discord: round-trip of a full campaign; the normalized projection
landing correctly (faction, scrip, total_cost 12, 3 model rows); cross-account
read/write/delete all refused; adoption of two signed-out campaigns reporting
"2 added to your account"; and a wiped-localStorage "new device" pulling both
back with their models.

Tests 107 → 118.

Files: functions/lib/campaignStore.js (new),
       functions/api/campaigns/[[path]].js (new), src/lib/remote.js (new),
       src/lib/remote.test.js (new), src/hooks/useSync.js (new),
       migrations/0002_campaign_sync.sql (new), src/hooks/useCampaign.js,
       src/lib/storage.js, src/App.jsx, src/components/ArsenalLibrary.jsx,
       src/components/SignInGate.jsx, CLAUDE.md, package.json,
       docs/VERSION_HISTORY.md
RESOLVED: the gate's three false claims; campaigns living only in localStorage;
the cross-account arsenal_models deletion; the silent offline warning; the
spurious blank leader on a new device
UNVERIFIED: production. Everything above was proven against a local D1 with a
forged session — the first real Discord sign-in against the live database is the
owner's. Session expiry sweeping is still unexercised.
NEXT: aftermath, and widen the projection when it lands. Ten low audit findings
open; the dialogue-count script still unwritten; the corrected PDF still unproven.

---

### Session 21 — v0.7.1
Date: 2026-08-22

**feat: authorization tests, a subject guard, origin checks, and account erasure**

Sync reached production and works — the owner confirmed arsenals appearing on
both phone and computer. The follow-up question was the right one: what stands
in for RLS, and what happens if Discord details leak.

**Session expiry was checked first and is fine.** `currentUser` compares
`expires_at` and deletes the row on read. That was the most likely real hole and
it was already closed.

**Three things now stand in for row-level security**, because D1 offers none:

1. `requireSubject` throws when a store function is called without a user. The
   failure that matters is not a wrong id, it is a *missing* one — that is what
   turns a scoped read into a query across every row. Now it is an exception on
   the first call.
2. One ownership gate before any write, already in from v0.7.0.
3. **Sixteen authorization tests** against a fake D1 that records every
   statement and its bindings, so a test asserts what was actually sent rather
   than what the code appears to say. They cover: every read binding the caller,
   a cross-account write running exactly one statement and deleting nothing, the
   `arsenal_models` delete carrying its own scope through `arsenals`, the owner
   never being taken from the payload, and every entry point refusing a missing
   subject.

That last set exists because the hand-run version found a live vulnerability
last session. Hand-running it again next time was never going to happen.

**Same-origin required on mutations.** `SameSite=Lax` already stops a
cross-site request carrying the cookie, so this is a second lock on one door —
worth it because loosening that cookie attribute is exactly the kind of change
made for an unrelated reason that quietly removes a protection nobody
remembered was load-bearing. Verified: cross-origin PUT 403, same-origin 200.

**Account erasure.** The only personal data here is a Discord id, display name
and avatar URL. Without a delete, "we hold very little about you" is a promise
with no exit. `DELETE /api/account` needs an explicit `{confirm:true}`, erases
campaigns, arsenals, model rows, sessions and the user, clears the cookie, and
the client clears localStorage as well — the point is the data is gone, not that
it is gone from one of two places. Nothing soft-deleted.

Verified against local D1: before, one user with three campaigns and two model
rows; after, every count zero, the second test account untouched, and the dead
session refused with 401.

Tests 118 → 134. `vite.config.js` now includes `functions/**/*.test.js`; that
directory runs on another runtime and never imports from `src/`, but it holds
the only code that can expose one player's data to another.

Files: functions/lib/campaignStore.js, functions/lib/campaignStore.test.js (new),
       functions/api/account.js (new), functions/api/campaigns/[[path]].js,
       functions/lib/auth.js, src/lib/remote.js,
       src/components/ArsenalLibrary.jsx, src/App.jsx, src/styles/app.css,
       vite.config.js, CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: scoping was convention, now guarded and tested; no way to erase
personal data; no CSRF defence behind SameSite
UNVERIFIED: erasure in production — deliberately not tested against the live
database, since the only account on it is the owner's.
NEXT: the shareable arsenal sheet, then aftermath.

---

### Session 22 — v0.8.0
Date: 2026-08-22

**feat: the arsenal sheet — every field of the official one, in our own hand**

The owner supplied both pages of Wyrd's Arsenal Sheet and chose "design
something better, but capture everything from the original". Copying the layout
was offered explicitly and declined, which is the right call: §8 bars trade
dress and the fan policy permitting this project is revocable. So the **fields**
match one for one — a player who knows the real sheet finds everything where
they expect it — while the type, palette and rules are the records-office ones
used everywhere else.

**What the sheet gave us that no amount of guessing would have:** a concrete
list of what this app does not yet track. Games won, crew rating, equipment (ten
slots), per-model injuries, the leadership experience track, totems, and the
master's health track. All of them are ruled and left blank rather than omitted,
so the sheet is usable at a table with a pencil today instead of being useless
until Aftermath lands.

**What it already knew, and prints:** crew name, faction, keywords, scrip, the
roster with costs, the crew card and its page reference, both advancement paths
as checkboxes, Miraculous Recovery, Df/Wp/Sp/Sz, base size, abilities, and the
full **Actions table with Rg / Skl / Rst / TN / Dmg** — which the register has
been handing us since v0.5.0 and nothing had used. `actionColumns` is a sibling
of `statLine` rather than a parse of it: a sheet is a table and a record is a
sentence, and splitting one back out of the other breaks the first time a value
contains a separator.

Games won is derived from `campaign.games`, not stored — same rule as every
other derived value here.

The experience track is held as data (`EXPERIENCE_TRACK`), three rows of
thirteen with the numbered boxes marked. That is a bare fact of the sheet, the
same kind as the archetype stat lines in `archetypes.js`, and reproduces no
rules text.

Verified live against a seeded leader: both pages render, games won reads 2 from
three recorded games, the crew list fills three of twelve rows with the injuries
sub-labels intact, Strategist is ticked and Bruiser is not, the wound track has
thirteen circles for a Schemer, and the actions table reads
`Blowdart · Missile 10" · 5 · Df · · 2` straight from BiggerHat.

Tests unchanged at 134 — this is presentation over data that is already covered.

Files: src/components/ArsenalSheet.jsx (new), src/lib/rules.js, src/App.jsx,
       src/components/Masthead.jsx, src/components/steps/Arsenal.jsx,
       src/styles/app.css, CLAUDE.md, package.json, docs/VERSION_HISTORY.md
RESOLVED: no shareable sheet; the register's Rg/Skl/Rst/TN/Dmg going unused
NEXT: campaign membership. The owner asked for invitations with real security
("so random people don't join and gain information about your discord") and a
read-only shared page showing every participant's arsenal, since arsenals are
public information by the rules. That widens read access from **owner** to
**member** — the exact change that reintroduces the v0.7.0 bug class — so it
lands with its own attack tests. `campaign_members` and `join_code` are already
in migration 0001, unused.

---

### Session 23 — v0.9.0
Date: 2026-08-30

**feat: the records office becomes a camp at dusk**

Owner direction, given mid-session: "The style of hodgepodge hearthside is very
plain right now. I want to make it a lot more warm and fun... shift it towards
the themes of cozy campfire on the open road, but with a fantasy vibe," with
Hank given "a more visible presence" through imagery the owner will draw.

This is a **redesign, not a polish.** The previous direction was not sloppy —
it was a deliberate, documented records-office aesthetic, and `tokens.css`
opened with a paragraph defending it. That paragraph is now wrong, and has been
rewritten rather than deleted, because a future session reading the old one
would "fix" the warmth back out.

**Key decisions and why:**

- **The old look was evidence, not a base to build on.** Impeccable's detector
  found only three anti-patterns in all of `src/`, all the same rule (a 3px
  coloured `border-left` on cards, on `.hank`, `.gap-note` and `.hire__quote`).
  Confirmation that the interface was cold by intent rather than by accident,
  so the fix was a new world, not a tidy-up. All three are gone; the detector
  now reports zero across `src/`, `public/` and `index.html`.
- **Every neutral carries brown now; there is no blue anywhere.** The old
  greys (`#15181d`, `#232932`) were blue-leaning, which is what made the app
  read as institutional even before you got to the typography.
- **One light source, and it falls off.** `body::before` is a fixed radial
  gradient low and centre, and it is the only authored motion in the app — a
  seven-second rise and fall. Everything else that moves is affordance.
- **Rye is the signboard and belongs to the wordmark alone.** It is a wood-type
  western showbill face, which suits a travelling peddler and — importantly for
  §8 — is nothing like Wyrd's gothic trade dress. Giving it to leader names
  would turn every model into a saloon poster, so `--sign` and `--display` are
  separate tokens. Alegreya replaced both Bodoni Moda and Georgia.
- **Courier stays only where it is measuring something.** Scrip, costs, week
  numbers, case numbers. It came off the navigation, the field labels, the
  account chrome and the Hank toggle, where it was a costume rather than data.
  Those went to Alegreya and got noticeably larger.
- **Hank got a face.** `HankSays` now renders a portrait beside the line. It is
  a plain `<img>` pointed at `public/art/hank-portrait.svg` rather than an
  inline SVG, so the artwork can be replaced by overwriting one file. It sits
  inside the existing `aria-hidden` wrapper, so it costs a screen reader user
  nothing (§5 unchanged).

**Two bugs found and fixed during the pass, both introduced by this work:**

- **`*` does not match pseudo-elements.** The existing reduced-motion rule was
  `* { animation: none !important }`, which the new `body::before` animation
  ignored completely. Now `*, *::before, *::after`. Anyone who asks for reduced
  motion was going to get a pulsing fire regardless.
- **The firelight would have printed on every page.** A fixed, full-viewport
  gradient pseudo-element renders behind the record and every crew card.
  `body::before { display: none }` added to the print block. The printed sheet
  is the artefact that leaves the app, so this would have been found by a
  player and not by us.

A third was caught on the mobile pass: the view nav grew from 10px uppercase
monospace to 15px Alegreya and stopped fitting 375px, clipping "Campaign".
`.views` now wraps like `.steps` always has.

**Verified:** 134 tests pass, production build clean. All thirteen changed
foreground/background pairs measured against WCAG AA — lowest is 5.05:1, and
that is coal on paper. Desktop and mobile inspected.

**Not verified:** the print output. The two print fixes are CSS asserted in the
source, and no print dialogue has ever been opened from this environment — the
same standing gap CLAUDE.md records for the PDF export. The owner's next export
is the proof.

**New:** `docs/ART_BRIEF.md`. The placeholder art is drawn in code and is meant
to be replaced; the brief gives exact render sizes, the 48px legibility floor,
the palette, and the §8 constraints, so the real art gets made once.

---

### Session 24 — v0.9.1
Date: 2026-08-31

**feat: Hank's real portrait**

The owner supplied `public/art/16-bit-hank.png` — a 16-bit pixel-art medallion
of Hank on the road with Henrietta under a full load, desert sunset behind,
already circular with its own metal rim and transparent corners — and asked for
it in place of the code-drawn placeholder.

**Key decisions and why:**

- **Served as a 288px WebP, not the 1254px master.** The original is 1.9 MB
  rendering into a ~96px circle, roughly 170× more pixels than any display
  needs. The derivative is 33 KB, a 58× reduction, on an element that appears
  beside every line of narration.
- **Lossy WebP, and lossless was measured rather than assumed.** PNG at 288px
  is 191 KB; lossy WebP is 33 KB; *lossless* WebP is 109 KB — worse, because
  downscaling resampled away the flat colour blocks that make pixel art
  compress well. Lossless is the instinct for pixel art and it was wrong here.
- **No PNG fallback.** Any browser that can run this React app supports WebP,
  and a `<picture>` element would break the one-file swap property that
  `docs/ART_BRIEF.md` documents. Noted there as a reversible bet.
- **The display size grew from 66px to 96px because of the art.** The
  placeholder was a flat silhouette that read fine when tiny. This is a full
  scene — sky, mesas, cacti, saddlebags, a plaid bedroll — and at 66px all of
  it collapsed into a brown smudge. Verified legible at 72px on a 375px
  viewport. The size can come back down if a future portrait is simpler.
- **`hank-portrait.svg` deleted rather than kept beside it.** It was superseded,
  and a dead placeholder next to the real asset is the kind of thing a later
  session wires up by mistake. It remains in git history.

**Trap worth recording:** `sharp-cli` names its output after the *input* file,
so `-o public/art/` would have silently overwritten the master with a 288px
version. The regeneration command in `docs/ART_BRIEF.md` writes to a scratch
directory and copies, and says why.

**Left alone deliberately:** the 1.9 MB master still sits in `public/`, so
Cloudflare serves it publicly even though no page requests it. It costs nothing
at page load and it is the owner's file in the owner's chosen location; logged
under Known issues rather than moved.

---

### Session 25 — v0.10.0
Date: 2026-08-31

**feat: the camp becomes the masthead, and leaders get a face**

Two owner-supplied images and one owner-requested feature.

**The hero.** `Hank-Hero-Image.png` replaces the code-drawn `road-horizon.svg`,
which is deleted. Served as two WebP derivatives — 960w at 99 KB below the
breakpoint, 1600w at 215 KB above it — from a 2.4 MB master.

The crop anchor is the load-bearing detail and the first attempt got it wrong:
the camp sits in the lower half of the image, so a centred `cover` crop showed
sky and mesas and cut off Hank, the fire and Henrietta entirely. It is anchored
at `50% 72%` and that number is recorded in `docs/ART_BRIEF.md`, because it
must be re-checked if the hero is ever redrawn.

The wordmark and nav now sit over a picture rather than a flat panel, so both
gained shadows and the nav buttons gained a translucent plate. Measured against
the brightest pixel of the sunset the nav still clears **5.24:1**.

**The background is deliberately NOT wired up.** `website-background.png` is
optimised and committed, but it carries the Wyrd wordmark on the `MALIFAUX`
signpost, and §8 forbids copying Wyrd's trade dress on a permission that is
revocable at any time. The owner is regenerating it. Two related marks in the
owner's mockup — a footer Wyrd logo, and a masthead subtitle reading "Wyrd
Games Campaign Companion" — were **not** implemented: the second directly
contradicts the disclaimer §8 requires, which says this app is not endorsed
by Wyrd.

**Leader portraits.** New `src/lib/portrait.js` plus 24 tests, a
`PortraitPicker` cropper, and `leader.portrait` in the campaign shape.

**Key decisions and why:**

- **Stored as a WebP data URL inside the campaign doc**, not in a bucket. It
  rides the machinery that already exists — localStorage working copy, D1
  mirror, JSON export — so it needs no R2, no signed URLs, no second auth path,
  and it survives this app disappearing, which §8 requires. There is also no
  public asset URL to guess.
- **`MAX_STORED_BYTES` is the load-bearing number, and it exists because of
  D1.** D1 caps a row at roughly 1 MB and the whole campaign lives in `doc`, so
  an unbounded portrait would not fail at upload — it would fail later, at
  sync, on a device the player is not looking at. A real 256px crop measured
  **18 KB**, taking a whole campaign to 25 KB.
- **Quality is dropped before dimensions.** At 256px a soft photo still reads;
  a 128px one looks broken beside hand-drawn art.
- **The stored image is square; the circle is CSS.** Baking transparent corners
  would cost bytes, lock the shape, and make the asset useless anywhere that is
  not a circle. The cropper dims the corners so it stays honest about what is
  kept.
- **No `schemaVersion` bump.** The field is optional and an absent key reads as
  undefined, which is falsy everywhere it is consulted, so old campaigns need
  no migration step.

**Three bugs found by driving the real UI, all introduced by this work:**

- **`loadImage` revoked its own object URL in `onload`.** The canvas was fine —
  the bitmap is decoded by then — but `img.src` pointed at a dead URL, so the
  cropper's preview rendered as an empty black square. Ownership of the URL now
  passes to the caller, with `releaseImage` called on save, cancel, replace and
  unmount.
- **Taking pointer capture stopped the browser focusing the frame**, so arrow-key
  panning silently did nothing after a click: the frame answered the mouse and
  ignored the keyboard until it was tabbed to. It now focuses explicitly on
  pointer down. Found by testing the keyboard path rather than assuming it.
- **A grid item spanning every row sizes those rows from the inside**, so the
  104px portrait stretched the shelf card's text rows and opened a gap under
  the eyebrow. `align-content: start` cannot fix that — the rows had already
  grown. The portrait is absolutely positioned instead.

**Verified:** 158 tests, build clean, detector clean. A real 2.4 MB PNG driven
through the whole path — validate, decode, pan by keyboard, crop, encode,
store, render on the shelf — at both desktop and mobile widths.

**Not covered by tests:** `renderPortrait`, `loadImage` and `releaseImage` touch
canvas and object URLs, the same licence `storage.js` takes. Everything above
them in the module is pure and tested.

---

### Session 26 — v0.10.1
Date: 2026-08-31

**feat: the props go on the table, and Hank keeps his head**

The owner regenerated `website-background.png` without the Wyrd wordmark — the
`MALIFAUX` signpost is now Sable Ridge, Ironhollow, Gravewatch and Duskmoor,
all invented, and the winged emblem is gone. The ornate border was dropped by
owner decision. That cleared the §8 block from v0.10.0 and the background is
now live at 250 KB.

The owner also reported the masthead cutting Hank's head off, with permission
to make it taller.

**Key decisions and why:**

- **The hero's height is in `vw`, not pixels, and that is the actual fix.**
  With `cover` on an image wider than its box, the fraction of the picture on
  show is `height x 2.5 / width` — so a fixed pixel height crops *harder the
  wider the monitor*. At the owner's ~2000px screen the old 268px showed 33% of
  the image and beheaded Hank; at 1280px the same rule showed 52%. Tying height
  to width holds the crop constant at ~57.5% everywhere. Measured identical at
  1600px and 2000px: band 28.7%–86.5%, hat at 34% and boots at 83% both inside.
- **The scrim became a pool behind the type instead of a band across the
  picture.** The wordmark is centred; Hank is at 22–40% from the left and
  Henrietta further right. A uniform 82% scrim at the top was burying both of
  them to keep one heading legible. Now a radial pool sits under the wordmark
  and the flat layer is much weaker. The nav was unaffected either way — it
  carries its own translucent plate and clears 5.24:1 against the brightest
  pixel of the sunset.
- **Mobile needed the opposite fix, on the other axis.** Below ~960px the box
  is taller-ratio than the image, so `cover` scales by *height* and crops
  horizontally instead. Centred, that cut Hank out and left mostly sky. The
  anchor is `36% 60%` there, which frames him with the fire. Above 960px the
  image scales by width and that x value does nothing.
- **The props and the firelight are separate fixed layers.** `body::before`
  holds the objects, `body::after` the fire, in that paint order — the fire has
  to fall *on* them, and they must not breathe with its animation.
- **The background is not loaded below 900px at all.** `cover` crops the props
  out of frame on a phone, so it would be 250 KB of pixels nobody sees, and any
  prop that did survive would sit behind the text. Verified: the computed
  `background-image` on `body::before` carries no file at 375px.
- **A soft-edged plate under the reading column.** The content column is 820px
  and the props reach further in than that on a wide screen, so bare text —
  labels, notes, the colophon — was landing on the wanted poster. Soft-edged
  rather than a box, since the frame that would have justified a hard edge was
  dropped.

**Verified:** 158 tests, build clean, detector clean. Crop geometry measured at
1280, 1600 and 2000px and confirmed identical; mobile checked separately.

---

### Session 27 — v0.10.2
Date: 2026-08-31

**revert: the background comes back out**

Owner decision on seeing v0.10.1 live: *"This is way too much. Take back out the
background. I don't like it as it turns out."* Removed the same session it
shipped.

Worth recording rather than quietly reverting, because the judgement is the
useful part: **the hero and a full-page background were competing for the same
job.** The masthead already carries the whole camp — tent, Hank, fire,
Henrietta, sunset — and putting a second detailed scene behind the reading
column meant every part of the page was asking to be looked at. Neither image
was at fault; there were two of them.

What came out with it, because all of it existed only to serve the background:

- The second fixed layer. `body::after` folded back into `body::before`, which
  is once again the single firelight layer it was in v0.9.0.
- The `min-width: 900px` gate that kept the 250 KB image off phones.
- The soft-edged plate under the reading column, whose only purpose was
  keeping bare labels and the colophon off the wanted poster.
- The print override for both.

**Kept:** `website-background.png` and `background-1536.webp` stay in
`public/art/`, referenced by nothing. They are the owner's art and the spec for
rebuilding is preserved in `docs/ART_BRIEF.md` under a heading that says
plainly it was built and removed. If it is ever tried again the note there says
the props need to be far quieter — a margin strip rather than `cover` — and the
hero would likely have to shrink to make room.

The hero, its vw-based height and both crop anchors are untouched.

**Verified:** 158 tests, build clean, and `background-1536` appears zero times
in the built stylesheet.

---

### Session 28 — v0.10.3
Date: 2026-08-31

**feat: the masthead pins and shrinks on scroll**

Owner request: the hero should lock in place and shrink so the navigation stays
reachable without the picture staying obnoxiously large.

**Key decisions and why:**

- **Fixed, not sticky, and this is the whole trick.** A *sticky* bar stays in
  the flow, so shrinking it shortens the document — and every time it shrank,
  the content below would jump up by exactly the height it lost. `position:
  fixed` takes it out of the flow and `.masthead__spacer` holds the full height
  open in its place, so the document height never changes. Verified: 1150px
  before and after the shrink.
- **One `--hero-h` custom property feeds both the bar's `min-height` and the
  spacer's `height`.** Two hard-coded copies of a `clamp()` would drift the
  first time either was touched, and the failure mode is a gap or an overlap at
  the top of the page.
- **Two thresholds, not one.** Shrinks past 150px, re-expands below 60px. A
  single threshold can sit exactly on the boundary and flip back and forth.
- **The compact bar is ~103px** (101px narrow) — roughly the height the header
  was before the hero existed. Title drops to 23px, the subtitle goes, and the
  scrim goes nearly opaque because at that height the image is a 15% sliver
  that would read as mud behind the type rather than as a picture.
- **Narrow screens get a different compact treatment.** Two wrapped rows of
  navigation plus an account row is not "out of the way" on a phone, so below
  900px the nav becomes a single horizontally scrolling row and the account
  chrome steps out — it is one scroll from the top, where it still sits.

**A long detour worth recording, because it will happen again:** almost every
attempt to verify this in the preview pane reported the feature broken when it
was not.

- `window.scrollTo` in the pane **does not emit scroll events at all** — proven
  by attaching a fresh listener that also recorded zero.
- `requestAnimationFrame` is throttled when the pane is not compositing, so
  even a hand-dispatched `scroll` event left the rAF-throttled handler pending
  and every reading looked stale.
- Screenshots **mis-composite fixed elements**, painting a large black band
  above a bar that `getBoundingClientRect` and `elementFromPoint` both place at
  `top: 0`.

The reliable technique: dispatch the event, force a paint by taking a
screenshot, *then* read the DOM. And trust `elementFromPoint` over the picture.

**Verified:** 1280px 368→103px; 880px 250→101px with the nav on one scrolling
row and the chrome hidden; document height unchanged across the transition;
re-expands on the way back up; no ancestor creating a containing block that
would break `fixed`. 158 tests, build clean.

---

### Session 29 — v0.11.0
Date: 2026-08-31

**feat: a 1024 column, a bottom navbar on phones, and a footer that fills**

Four owner observations from the live site, taken together.

**The reading column goes to 1024px**, centred above that. Four places carried
the same hard-coded 820px; they now read one `--wrap-w`, because a masthead row
that disagrees with the column beneath it is immediately visible.

One measure had to be protected rather than widened: `.hank__line` is capped at
76ch. Hank's narration is the only genuinely long-form prose on the page and at
1024px it ran past 120 characters a line. Nothing else needed it.

**The footer fills its column again.** The `max-width: 68ch` on `.colophon` and
`.privacy__line` dated from the 820px column and the busy props background;
at 1024 on a plain ground it just left a ragged hole down the right-hand side.
Removed — measured at 984px, exactly the column's inner width.

**Phones get a bottom navbar.** Five destinations could not fit a shrinking
top bar without clipping, and the horizontally-scrolling row that replaced the
wrapped rows only moved the problem — it hid whichever end you were not looking
at, which is what the owner's screenshot showed. Below 768px `.views` leaves
the masthead and becomes a fixed bottom bar: always visible, never clipped, and
where a thumb already is. The wordmark stays at the top, as the owner asked.

The nav stays inside `<header>` in the DOM and is *not* clipped by the
masthead's `overflow: hidden` — `position: fixed` resolves against the viewport,
and an ancestor's overflow only clips a fixed descendant if that ancestor is
also its containing block, which the masthead is not. Verified rather than
assumed. `env(safe-area-inset-bottom)` keeps it clear of the home indicator,
and `.shell` gains matching bottom padding so the last card is not underneath
it.

**The shrink thresholds came down, 150/60 to 80/24.** The shelf is the shortest
page in the app and, at a 1024 column, has about 110px of scroll in total — so
a 150px trigger meant the one screen you land on could never shrink, which is
exactly where the hero is most in the way. Shrinking has to be reachable on the
shortest page.

**A real bug found while measuring, present since the hero landed in v0.10.0:**
the wordmark was never centred. `.masthead__top` was centred, but the
centering override sat *above* the base rule's `justify-content: space-between`
and lost to it at equal specificity, so the title was pinned left. Invisible at
an 820px column; obvious at 1024. Fixed at the base rule so there is one
source.

**Verified:** wordmark, subtitle, nav and column all centred at the same
midpoint; footer 984px against a 984px inner column; shelf now shrinks at its
109px maximum scroll; phone header 71px with a 48px bottom bar carrying all
five labels untruncated. 158 tests, build clean.

---

### Session 30 — v0.11.1
Date: 2026-08-31

**audit: the overdue §5 pass, nine sessions late**

`docs/audits/audit-v0.11.0.md`. Three highs, five mediums, fourteen lows.
**No fix code** — §5 requires the catalogue first, and this session produced
only the catalogue and the corrections to this file's own claims.

The three highs, all about data crossing a boundary it should not:

- **Signing out clears nothing locally.** The next account to sign in on that
  browser sees the previous one's campaigns on a shelf labelled "your leaders",
  can open and export them — and its own campaigns then stop syncing, because
  `planSync` tries to push the stale ones, `putCampaign` correctly refuses, the
  endpoint renders that as 404, and `reconcile`'s push loop `break`s on it
  every time. The D1 ownership gate held perfectly; this is entirely a
  client-side lifecycle problem.
- **Two of three *Export JSON* buttons emit files `adopt()` rejects.** The
  shelf exports a campaign; the Arsenal view exports an arsenal; creation's
  Record step exports the flat wizard adapter. §8 calls portability a
  requirement, and the previous audit's H1 was this same promise broken in the
  other direction.
- **The gate's rescue export reads only pre-v0.6.0 keys.** It offers nothing
  to any browser whose campaigns live on the shelf — which is all of them —
  and it renders exactly when the backend is down, which is the scenario §12b
  wrote the obligation for.

**Two corrections to this file, both of which it had been asserting for
versions.** It claimed the v0.5.2 audit's "high and all mediums are closed";
M8 is a medium and is untouched, so a real finding had been recorded as fixed
since v0.6.0. And the test count still read 134 against an actual 158.

**The dialogue check passed, and the way it passed is worth keeping.**
`hank.js` and `hank-dialogue.md` agree at 241 lines. The code side was counted
by importing the module and walking every exported value — no regex — because
a fresh scan of the *doc* returned 235 and would have reported drift for the
second audit running. The six missing entries are `H1-01`…`H1-06`: a prefix
containing a digit, which M6's three-format table does not cover. There are
four formats. Counting the doc by pattern has now produced a wrong answer
twice; the durable fix is still to generate the doc from the code.

**Named as uncheckable:** the print output. Three of the last audit's findings
came from reading an exported PDF, and the print path has since been through a
full redesign — new palette, a fixed masthead, a full-viewport firelight
pseudo-element, and two print-only rules written to suppress it, none rendered
to paper. Every print assertion in this audit is source-reading only, and one
real export would be worth more than another pass over the CSS.

Of the eight findings that are not carried over from v0.5.2, **four were
introduced during the nine sessions the audit was late.**

---

### Session 31 — v0.12.0
Date: 2026-08-31

**fix: the audit's findings, and the print export that closed the last gap**

The owner supplied a real PDF export, which the audit had named as the one
thing it could not check. Read by inflating the content streams and decoding
the subset fonts through their ToUnicode maps. **The v0.9.0 firelight fix
works** — no full-viewport wash, records print on white. Two new defects fell
out of it, and both are fixed here along with everything else in the catalogue.

**P1 — every card printed its drop shadow.** Chrome renders `box-shadow` as an
alpha-blended black rectangle; on paper that is a grey smear down two edges of
every card. `--shadow-2` exists to lift a card off a dark ground and paper has
none. All shadows are now cleared for print.

**P2 — a crew card split and orphaned its tail.** `.crewcard` asked for
`break-inside: avoid` while also taking `break-before: page`, and the card is
taller than a page — so the request could not be honoured and Chrome broke it
at the worst available point. L8 recorded exactly this for `.record` in the
last audit and it was never carried across. The card may now split; what is
pinned instead is the tail — a heading may not end a page, the foot may not be
separated from what it closes, and orphans/widows are set.

**H1 — the shelf is scoped by account, not by browser.** Signing out clears
nothing from localStorage, so the next person to sign in on a shared machine
was shown the previous account's leaders under a heading saying they were
theirs — and their own campaigns then stopped syncing, because `planSync`
pushed the stale ones, the ownership gate correctly refused, and the push loop
broke on the first failure every time.

Fixed by ownership rather than by deletion. Campaigns carry `ownerUserId`;
`belongsTo` decides visibility; an unclaimed campaign is visible to anyone,
which preserves the adoption path §12 describes, and a claimed one is visible
only to its owner. **Nothing is deleted** — someone else's campaign stays on
disk, hidden, because the alternative is throwing away work that may not have
finished syncing. The push loop now continues past a failure instead of
stopping at it.

**H2 — all three *Export JSON* buttons emit a campaign.** The Arsenal view was
exporting an arsenal and creation's Record step the flat wizard adapter,
neither of which `adopt` accepts. `Record` also had to gain `campaign` in its
signature; without it the button would have exported `undefined`, which the
build would not have caught.

**H3 — the gate's rescue reads the shelf.** It was reading two pre-v0.6.0 keys
and so offered nothing to any browser using the shelf, in exactly the situation
§12b wrote it for. It now exports a bundle when there is more than one campaign,
and `adopt` accepts a bundle — an export this app cannot read back is not a
rescue, which is the same lesson as H2.

**M1** the weekly hire passes four fields rather than the whole register
record. **M2** Sheet and Creation step 4 no longer render a blank page for an
unfinished leader; verified in the browser, since that blank page was seen live
earlier in the session. **M3** a retired token still referenced from a JSX
inline style — the v0.9.0 rename was scripted over `app.css` and never looked
at inline styles. **M4/M5** totems: `totemSlugs` is finally wired, `useRoster`
marks `isTotem`, `checkSource` rejects it, and the cost message stops claiming
a rule it never enforced. The roster cache key is versioned, or no existing
browser would ever see the change.

Lows fixed: L1, L4, L5, L11, L14. Eight remain open and are listed in the
audit's status block.

**Tests 158 → 175.** Both new rules are asserted rather than described:
`belongsTo` has four cases, and a new `validation.test.js` covers `checkSource`
— including that the cost message no longer names totems, which is the wording
that was false for eight versions.

---

### Session 32 — v0.13.0
Date: 2026-08-31

**fix: the print split, measured this time; every remaining low; a wood grain**

**P2 was not fixed in v0.12.0, and the second export proved it** — page 3 came
back byte-identical, still holding only a crew card's tail. The v0.12.0 attempt
pinned `.record__section` with `break-inside: avoid`, which turned out to be
*causing* the near-empty page: the whole Abilities block jumped to the next
sheet rather than letting two of its entries follow the others.

The real cause was headroom, and this time it was measured rather than reasoned
about. Switching the `@media print` block to screen media in the browser and
rendering a representative card at the printable width (711px — which matches
the 711-unit rectangles visible in the PDF, so the harness agrees with reality)
gave **921px against 950px of printable height. Twenty-nine pixels of slack**,
which one extra trigger line eats.

Crew-card print typography is tightened, and only there: the same card now
measures **761px, with 189px spare**. A section may flow; an entry may not. A
genuinely enormous card still will not fit one page — measured at 1054px — but
its spill is now a few entries rather than a whole section.

**P1 is confirmed fixed by the same export:** zero dark page-sized rectangles,
where every page previously carried one.

**All fourteen lows are closed.** Two of them — L6 and L13 — are closed as
*documented rather than changed*, because both flagged code that behaves that
way for a reason: L6 depends on storage keeping one injury row per titled
group, and L13's ref is assigned during render because an effect would leave
the first save of the session unmirrored. The reasoning is in the code now
instead of waiting to be rediscovered.

The substantive ones: **L2** wires `VITE_REGISTRY_MODE=local`, so `npm run seed`
finally writes something the app can read — which also means the wizard can be
worked on without touching a donation-funded register. **L3** removes three
indexed fields and one exported callback that nothing read, all of which were
riding into localStorage on every roster cache. **L12** puts the portrait on the
record, the arsenal sheet and the canvas PNG; it had been on the shelf card and
nowhere that leaves the app.

**A wood grain, by owner request.** Drawn in gradients rather than shipped as
an image: no request, no bytes, no cache, crisp at any zoom. Three horizontal
layers at deliberately mismatched frequencies so they never line up into a
visible repeat, plus a lateral shading so the field does not read as wallpaper.
The strongest alpha in the grain itself is 0.055 on near-black. It should be
felt rather than seen.

**Verified:** 175 tests, build clean. The print change measured in the browser
against the real print stylesheet; the PNG portrait exercised end to end with
the anchor click stubbed so nothing downloaded.

---

### Session 33 — v0.13.1
Date: 2026-08-31

**fix: the ownership check ran before auth had answered**

Owner report: after loading the site, the masthead showed only **Leaders** —
every other tab gone, with a campaign plainly on the shelf.

A regression from v0.12.0's H1 fix, and an instructive one. `useAuth` reports
`user: null` while its first `/api/auth/me` is still in flight, so for the
length of that request `userId` is null. The ownership effect could not tell
that apart from *signed out*, decided the open campaign — stamped with the
owner's Discord id the moment they last saved — belonged to somebody else, and
closed it.

The damaging part was not the close but that it **persisted**:
`setActiveCampaignId(null)` writes to localStorage, so when auth resolved a
moment later there was no longer an active campaign to restore. Transient
state that writes itself down stops being transient.

Fixed by giving the hook `userReady` alongside `userId`, so it can tell "nobody
is signed in" from "we have not asked yet", and by extracting the decision into
`shouldRelease(campaign, userId, userReady)` — a pure function with six tests,
the first of which is this exact regression. The condition that mattered was
the one that was missing, so it is now a named thing that can be asserted
rather than a line inside an effect.

The shelf filter takes the same guard: while auth is unresolved every campaign
is shown, because hiding them for the length of a request produced a visible
flicker on every load.

**One consequence for anyone who loaded the site while v0.13.0 was live:** the
bug cleared `campaigns:active`, so the app opens on the shelf rather than on
the campaign that was last open. Clicking **View arsenal** once restores it,
and it persists again from there. Nothing was lost — the closure only ever
touched which campaign was open, never a campaign.

**Verified:** 181 tests, build clean, and the five tabs confirmed present on
load and after opening a campaign.

---

### Session 34 — v0.14.0
Date: 2026-08-31

**feat: installable — manifest, icons and a service worker**

Owner request: make it installable on a device.

**The constraint that shaped the whole thing: the service worker must never
cache `/api/`.** That path carries three things and each forbids it on its own.
`/api/v1/*` is the BiggerHat proxy, so a cached response there is card text on
disk, outliving the tab and no longer refreshed by an errata — §4's exact
prohibition, and it would silently undo the trouble `rules.js` takes to hold
that text in a Map that dies with the page. `/api/auth/*` cached is a stale
identity, and `/api/campaigns/*` cached is somebody's twelve weeks, wrong. One
`return`, first branch in the fetch handler, covers all three. It is written
into CLAUDE.md §4 rather than only into the file, because it is the kind of
rule a later "let's cache more" change would step on without noticing.

**Verified rather than assumed:** with `/api/auth/me` and `/api/v1/factions`
both explicitly fetched, an audit of every Cache Storage entry found **zero**
under `/api/`.

**What is cached:** the shell, the hashed bundles, the artwork and the four
webfonts. All of it is content-hashed or immutable, so cache-first is safe —
a deploy produces new URLs, and `index.html` is fetched network-first so those
new URLs are found. No `skipWaiting`: a new worker waits for the old one to be
released rather than swapping assets under a page that is mid-campaign.

**Icons** are derived from `16-bit-hank.png` with sharp. The maskable one is
not simply a resize: Android crops a maskable icon to a circle inscribed in
about 80% of the square, and this artwork is *already* a circle, so a naive
export would have lost the brass rim and a slice of Hank. It is scaled into the
safe zone and padded on `--night` instead. Everything is flattened onto that
same colour, because the source has transparent corners and palette
quantisation was turning them white.

**Registration is production-only.** `npm run dev` serves `public/` too, so
registering there would put a worker in front of the dev server and cache
whatever Vite happened to be serving — the classic way to spend an afternoon
chasing a stale bundle that no longer exists on disk.

**Tested offline for real**, not simulated: the preview server was stopped
outright and the page reloaded. The app rendered completely — Rye from cache,
the hero image, the full navigation.

**Known, and needing an owner decision:** in production that offline launch
reaches `SignInGate`, because `/api/auth/me` cannot answer and §12b gates play
behind an account. So an installed app opened without a connection currently
opens to "Sign-in is unreachable". The install is still worth having — own
window, instant launch, no browser chrome — but "installable" and "usable on a
train" are not the same thing yet, and closing that gap means changing a
documented rule rather than adding code.

---

### Session 35 — v0.15.0
Date: 2026-08-31

**feat: a remembered session, so an installed app opens without a signal**

Owner decision, following v0.14.0: making the app installable made §12b's
accepted cost unacceptable. "A backend outage blocks play entirely" was a
defensible trade for a website; for something on a home screen it means an icon
that opens to "Sign-in is unreachable" over twelve weeks of local campaigns.

A successful sign-in is now remembered on the device and stands in when
`/api/auth/me` cannot be reached.

**The distinction the whole thing turns on**, and the reason `decideSession` is
a tested pure function rather than a branch inside the hook:

> An answer of "nobody is signed in" is authoritative and clears the remembered
> session. **No answer at all** is what the fallback is for.

Conflating those would either lock a signed-in player out on a train, or keep
admitting someone who had signed out. Six tests cover it, including both of
those failure modes.

**`available` stays false while offline**, deliberately. It is what stops
`useSync` pushing into the void and what makes the shelf state honest — it now
says "Working offline… will sync to your account when the service is reachable
again" rather than the signed-out warning, which said the opposite of the
truth. Local edits ride the normal reconcile when `available` flips back, which
an `online` listener provokes; `planSync` already handled the merge, newer
`updatedAt` winning with ties keeping local.

**What the remembered session grants: nothing on the server.** It decides
whether the wizard opens and which local campaigns are visible. Every D1 read
and write still needs the real cookie, and `campaignStore.js` still takes the
owner from the session. Forging it would show you campaigns already sitting
unencrypted in the same browser's localStorage. It is cleared on sign-out and
on account deletion.

**A latent bug found while writing it:** `signOut` awaited the logout request
before clearing local state, so signing out with no connection threw and never
reached `setUser(null)` — the session stayed on screen and, once remembered
existed, on disk. Sign-out that only works with a signal is not sign-out. The
local half now always runs.

**A second one, exposed rather than caused:** the masthead's account chrome was
absolutely positioned, so nothing reserved space for it and a wide title simply
overlapped it. The offline chip made it visible. It is a three-column grid now,
and the fix needed a more specific selector than the base rule — the same
source-order trap that left the wordmark left-aligned for four versions.

**Verified with the server stopped outright**, not simulated: admitted from the
remembered session, the account's own campaign on the shelf, the offline chip
in the badge, and the shelf's line saying the work will sync. Restarting the
server and reloading cleared the remembered session, because the backend
answered "nobody is signed in" — the authoritative case, working.

187 tests, build clean.

---

### Session 36 — v0.15.1
Date: 2026-08-31

**feat: the background props come back, at a tenth**

Owner request. The props were built at 90% in v0.10.1 and removed the same day
as "way too much"; the opacity turns out to have been the whole argument. At
.9 the hero and the background competed for the same job. At **.10** the props
stop competing and become texture — the lantern and the steer skull register
as shape, the wanted poster and the signposts only if you go looking.

Structurally it is the v0.10.1 arrangement again: two fixed layers,
`body::before` for the objects and `body::after` for the firelight, in that
order, because the fire has to fall *on* the objects and the objects must not
breathe with its animation. The wood grain stays where it is, on `body` itself,
below both.

What did **not** come back, because at a tenth it is not needed: the soft plate
under the reading column. It existed only to keep bare labels off the wanted
poster, and at this strength nothing is competing with the text.

Still not loaded below 900px — `cover` crops the props out of frame on a phone,
so it would be 250 KB nobody sees. Both layers are hidden in print.

`docs/ART_BRIEF.md` records the outcome of having run this both ways: a second
full scene cannot share a page with the hero at any strength where it reads as
a picture. If it is raised again, raise it in small steps and stop at the point
where you notice it without looking.

187 tests, build clean.

---

### Session 37 — v0.16.0
Date: 2026-08-31

**feat: the aftermath, all six phases, and a week you can argue with**

The largest single feature since the campaign shape itself. Everything under
"Written but not wired" is now wired, and five of the arsenal sheet's six
ruled-and-blank sections are filled.

The owner supplied `docs/Index_of_the_Untold.pdf`, which is why this session
could work from the book rather than from memory of it. Two things fell out of
reading it that were not the point of the session and matter more than most of
what was:

**`experienceEarned` was missing a rule, and the audit had blessed the gap.**
The book gives 1 XP *for playing the game* — "every encounter teaches
something" (p.31) — before any of the conditional points. Audit L1 looked at
the code, counted two reachable points, saw a comment claiming three, and
concluded the book's maximum "describes a rule that is not implemented and may
not exist". The rule existed. The book's own worked example on p.37 awards Jack
three points for one game: playing, losing, and being a Bruiser who killed
something. That example is now a test, because it is the cheapest possible
guard against the same mistake.

The lesson worth keeping: **an audit that reasons from the code cannot find a
missing rule.** L1 was diligent and still wrong, because the only evidence it
had was the artefact being audited. Anything of the form "the book probably
doesn't say this" needs the book open.

**`EXPERIENCE_TRACK` in `ArsenalSheet.jsx` was wrong.** Rows two and three had
their numbers in the wrong columns. It had been wrong since the sheet shipped
and nothing could have caught it, because the sheet was the only thing that
used it and a track of plausible-looking numbers looks fine.

The correct track was read off the printed page's glyph coordinates rather than
transcribed by eye — the PDF's text layer serves the three rows interleaved,
which is very likely how the original error happened. It cross-checks against
p.37's example (first three boxes 1, 1, 2). It now lives in
`data/advancements.js`, beside the flow that walks it, because two copies of
one table is exactly how this survives.

**The aftermath is one stateful flow, and the record lives on the game.**
`AFTERMATH_PHASES` has said since v0.1 that the deck is not reshuffled between
phases; this is the first code that has to honour it. Six screens would each
imply a fresh deck. So `Aftermath.jsx` walks the sequence, and the whole
`aftermath` record is stored on the game — which means closing the tab between
the barter and the injuries loses nothing, and an unfinished aftermath syncs to
D1 like anything else. The campaign tab carries a dot while one is open,
because a half-finished aftermath holds unpaid scrip and unflipped injuries and
is the easiest thing in the app to forget.

**Effects land as they are confirmed, not at the end.** A player who walks away
after payday has still earned the scrip. That forces every write to be
idempotent, which is what the `paid` and `applied` flags on the record are for.

**A withdrawal on turn one or two is a different shape, not a smaller one.**
Five of six phases do not happen. `phasesFor` marks them skipped *with a
reason* rather than dropping them, so a forfeited aftermath reads as the book's
price for getting out early rather than as a broken screen.

**The app owns no fate deck, and must not pretend to.** Every flip is entered
by hand through `FlipInput`. A "flip for me" button would be a different game:
the aftermath economy is one hand of cards spent across six phases, and a
player who cheated a 12 on barter has one fewer card for the injuries. The
`cheated` checkbox is not decoration — three separate rules turn on it (a
cheated red joker on barter counts as a thirteen instead of reaching Those Who
Thirst, a cheated red joker on injuries is a plain miss rather than a Lucky
Miss, and a cheated joker on an advancement table reads as its value), and it
is asked for only where it changes the answer.

**Book tables: names, values and page numbers. No effect text.** §4 forbids
persisting rules text, and unlike model cards there is no live source to fetch
this from — BiggerHat carries the Malifaux namespace, not campaign-book
content. So `equipment.js` (82 barter items + 9 relics), `injuries.js` (the
injury chart, Lucky Miss, the back-alley doctor) and `advancements.js` (~250
entries across six tables) hold identifiers and a page reference each, and the
player reads the effect in the book. Owner decision, this session, choosing
page references throughout over a bare name list.

Modelled as *behaviour* rather than prose wherever the app is responsible for a
number: `injury`, `annihilates`, `reflipIf`, `luckyMiss`. Each reflip condition
is a real branch — a model with no triggers that flips Permanent Hex has not
been injured, and a campaign rating computed as though it had is wrong for the
rest of the campaign. The app has never seen a stat card, so it asks.

**Three flip semantics, and getting them wrong is invisible.** `orLower` for
the modification and action tables, `exact` for totems, `choose` for summoning
and the crew card. Offering the whole totem table on a 12 rather than the one
totem printed at 12 is a strictly better campaign than the book's, quietly, and
nobody would notice. It is asserted in the tests.

**Annihilation is checked at the end of phase 6, never during it.** A model can
reach three injuries mid-game — the Mutagen Injector does exactly that — and
still fights until this moment. Counting as you go removes it a phase early and
takes its cost out of the arsenal total while barter is still open.

**Miraculous recovery drops the injury rather than healing it.** "No new injury
is gained but the previous two remain." A `removedAt` would put a visit to
Dr. Mo in the ledger that never happened, so `dropInjury` deletes the row. It is
the only place anything is deleted from `injuries`.

**The week can be set by hand, and it is still an offset.** Owner request. The
week decides the first-of-week discount, whether a hire is owed, and which week
each model is filed under, so being wrong about it is being wrong about the
ledger. But `offsetForWeek` writes a correction and lets the calendar keep
doing the work: a campaign set to week six on Sunday is in week seven the
following Sunday without anyone coming back. A stored `currentWeek` stops dead
the moment nobody presses the button, and then two devices disagree with no way
to tell which is stale.

**The arsenal sheet.** Games won, crew rating, equipment, per-model injuries,
the experience track and the totem are all filled. Two things stay ruled and
blank on purpose: the equipment half of the campaign rating, which counts kit
*hired for a game* and so has no value between games — the sheet prints
"N + kit hired" — and the totem's actions, which come off a card §4 does not
let this app store.

**One Hank line removed from a screen, none written.** All the dialogue this
needed already existed. `healSkipped` was rendered on arrival at the doctor and
has been dropped: it reads as Hank accepting a decision the player has not made
yet, which is the timing rule (§2), and skipping ends the phase so there is no
later moment to say it in. No change to `hank.js`, so the dual-file rule (§1)
did not fire.

**`docs/*.pdf` is now in `.gitignore`, and this is not housekeeping.** The
repository is public. The book's own copyright page permits personal
non-commercial copies and explicitly bars distributing them. A `git add .` with
the book sitting in `docs/` would have redistributed Wyrd's product from a
public repo — the fastest available way to lose the fan-policy permission this
whole project stands on (§8). Keep the copy locally; it is the source for three
data files and will be needed again.

**Totems, and two comments that had been lying for two audits.** The owner
asked whether it was right that every Versatile model shows in the weekly hire.
It is — the register marks exactly 14 Neverborn Versatile and the picker shows
those 14, and Versatile means hirable regardless of keyword, which is the
campaign rule too. But checking it turned up something else.

`indexing.js` said, in a comment: "**Totems are deliberately not filtered here.
They are perfectly hirable** — stripping them from the roster would bar the
weekly hire from buying one." `validation.js` said: "Totems are checked
separately from cost because they **HAVE costs** — the cost test never caught
them" (audit v0.11.0, M4/M5). A test was named after that second claim.

Both are false. Checked against the live register: **every totem has `cost:
null`** — all 16 in Neverborn, all 16 in Guild, and the detail endpoint agrees
with the index — so the cost test caught every one of them and the roster never
contained a totem at all. The two comments described opposite behaviours to
each other and neither described the code.

The consequences were all dead code rather than bugs, which is why nothing
caught it:

- `totemSlugs()` built a set of totems named by masters, for a marking pass that
  ran on an **already cost-filtered list**, so `isTotem` was never once true.
- `validation.js`'s totem branch therefore never executed.
- The `roster:2:` cache-key bump, introduced so that "browsers holding an old
  cache would stop offering totems as selection sources", solved nothing.
- `totemSlug` rode into every cached roster in localStorage, read by nobody —
  the same waste audit L3 removed three other fields for.

There is a correct signal and it was sitting next to the one already in use:
totems carry `'totem'` in `characteristics`, exactly where `isVersatile` reads.
`station` is not it — no record in any faction carries `station: 'Totem'`, and
known totems come back `null`, `Peon` or `Minion`, which is the same
unreliability §6 already warns about for masters.

So: `isTotem()` reads the characteristic, `isSelectionSource` excludes totems
**by name** rather than as a side effect of a data quirk that could change
upstream, `validation.js` keeps its totem *message* (which is what M4/M5 was
really complaining about — being told a totem is a "costless model" is
confusing) but now has a check that can actually fire, and `totemSlugs`,
`totemSlug` and the `isTotem` marking are gone. The cache key is deliberately
**not** bumped: old caches were built by a filter that already excluded totems,
so they contain none, and bumping would re-fetch a donation-funded register for
a byte-identical result.

The fixtures were rebuilt too, because they were the mechanism by which the
false belief survived. `validation.test.js` asserted a totem with `cost: 4` and
`isTotem: true` — a shape the register cannot produce — under a test name that
repeated the wrong claim. They now match what the API really serves, and
`indexing.test.js` pins a real Jackalope record as a fixture. One test keeps the
old case as a *defensive* one: if the register ever does give a totem a cost,
the characteristic check still bars it.

**Owner's ruling on where totems belong.** They come from the tier-3 advancement
table and nowhere else, so they are not a hire and not a Versatile-adjacent
oddity — they get their own category, and only the totem actually earned counts.
The Arsenal view now has a Totem section: the earned totem with its advancement
count and `free · 0ss`, or an explanation of the only route to one. It is
deliberately outside the week groups and outside the arsenal total — a totem has
no scrip price and no soulstone cost, and folding it into either would put it in
the ledger beside models that were paid for, or inflate the encounter cap it has
no business touching.

**Owner's ruling on the Versatile grouping.** A Versatile model that also shares
your declared keyword stays under "Versatile" rather than moving to "From your
keywords". Versatile names what a model *is*, not why you happen to be allowed
it, so the same model is always in the same place regardless of who declared
what. The surcharge asks its own question and was never affected either way.

**A note on §5's third audit trigger, which fired and was overruled.** This
session first recorded an audit as blocking under "8+ files or a shared
module". The owner questioned it, and checking the record showed the trigger is
the problem rather than the answer: it fired at Session 34 (10 files), Session
35 (10 files) and Session 37 (22), and was ignored the first two times, because
nearly every feature session touches eight files.

A trigger that fires constantly and is ignored constantly is worse than no
trigger — it devalues the two beside it, one of which (the 10-session cadence)
is the rule that has actually caught drift. §5 now says so, and the next audit
stays on its schedule at Session 39, covering Sessions 30–38 together.

The narrow check this session does need is a different job from the §5 ritual
anyway: the ritual reads `src/` for cross-file drift and would never re-derive a
barter rating from the book. ~370 rows of transcription need the book open
beside the file, and no test can substitute, because the test would be
transcribed from the same source.

Worth noticing that both audit-shaped mistakes this session turned up have the
same root: **checking an artefact against itself.** L1 reasoned about the book
from the code; a test of the equipment table written from the equipment table
would do the same. Both need the external source in hand.

258 tests (up from 187), build clean. Walked end to end in the browser: two
full aftermaths including an early withdrawal, a reflip, an annihilation, a
heal, two advancements and a week set forward from 3 to 7; then the totem
section in both states, with the arsenal total confirmed to exclude it.

---

### Session 38 — v0.17.0
Date: 2026-08-31

**feat: the week is yours to set, and campaigns have other people in them**

Two owner requests: explicit control over the week, and the membership feature
that has sat at the top of "next feature work" since v0.8.0.

#### The week, in two modes

Migration 0001 says, in a comment: "current_week is NOT stored. It derives from
started_at, because a counter is only right if someone remembers to press a
button." That is a good argument and it is not the whole argument. It is right
for a group who would rather not think about the week, and simply wrong for a
group who meets when they can — a campaign that plays fortnightly is *always*
wrong in calendar mode, and no amount of correcting an offset fixes a mechanism
that is measuring the wrong thing.

So the mode is now a per-campaign choice.

- **Calendar** is unchanged and still the default: real time from `startedAt`,
  corrected by `weekOffset`, and it cannot go stale.
- **Manual** stores `manualWeek` and moves only when someone moves it.

The objection in 0001 does not apply to manual mode, because in manual mode
pressing the button *is* the group's intent rather than a chore they might
forget. Both are merged by the same `updatedAt`-wins rule as scrip, so two
devices are no worse off than they already were.

`setWeekPatch`, `stepWeekPatch` and `weekModePatch` exist so no call site
branches on the mode. The two representations are an implementation detail of
one idea, and a caller that has to know which is in force will eventually get
it wrong.

**Regressing was the real gap, and the owner asked for it directly.** The offset
could only ever be written by typing an absolute number, so a group who ticked
over by mistake, or agreed to replay a week nobody could make, had no way back
that looked like a way back. Forward and back are now buttons in both modes,
floored at week one.

Also newly editable, none of which had a control anywhere: **campaign length**
(the book says 4–12 and the field was hardcoded to 12), **week length in days**
(the book explicitly invites 3 or 1), and **the start date** — which matters
most, because the app is nearly always opened after the first game and every
calendar week is measured from it.

`weekModePatch` carries the week on screen across a mode switch in both
directions. A switch that moved the number would read as data loss.

#### Membership

The design CLAUDE.md has specified since v0.8.0, built. **`join_code` stays
unused**: a bare code is a capability URL, anyone holding it is in, and being in
used to mean seeing everyone's Discord identity.

**The risky change was avoided rather than tested.** CLAUDE.md warned that
widening `putCampaign` to accept a non-owner writer "is precisely the change
that created the `arsenal_models` hole in v0.7.0". The obvious shape for
membership — one campaign row with several contributors — requires exactly that.

So writes were not widened at all. `campaignStore.js` is untouched apart from
three new projection columns. Every player still owns their own campaign row
containing their own arsenal; membership is a **pointer**, `campaigns.member_of`,
from a player's campaign to the host's:

```
Alice's campaign  H   (member_of NULL — the host)
Bob's campaign    B   (member_of = H)
```

The shared page is then one read across campaigns linked to H, and CLAUDE.md's
rule holds without a single write path changing. The five attack tests it
demanded pass, and so do forty-four others.

**Two gates, because a link can be forwarded.** Redeeming makes you `pending`;
only the host admitting you makes you `active`; only `active` reads anything. A
forwarded link costs the host a decision, not a leak. `roleIn` returns a role
rather than a boolean so no caller can accidentally treat pending as in.

**Tokens are stored as hashes.** The row is what an attacker with database read
access would want, and a SHA-256 is useless to them — the token exists only in
the link the host sends, and is shown in the UI exactly once. Single-use is
enforced in the claiming UPDATE's own `WHERE redeemed_by IS NULL`, not by the
SELECT above it, because two requests can pass a read simultaneously and only
one can win a write.

**What crosses the member boundary is the nickname, and nothing else.** The
owner's ruling: identity sharing is opt-in, per campaign, in the player's hands.
`share_identity` defaults to 0 — a privacy default that leaks is not a setting,
it is a formality — and `publicMember` is the single function that decides what
leaves, so there is one place to check rather than one per query.

**A leak found by the tests, not by review.** The first draft of `publicMember`
included `userId` for everyone. The test named "never sends another player's
user id" caught it. A user id outlives the campaign, is the same id everywhere
else that account goes, and joins somebody's arsenal to them permanently —
which is the correlation the nickname exists to prevent. Now the host gets ids
on the member list, where admitting and removing have to name a row, and
**nobody** gets them on the shared arsenal page, which is read-only and has no
use for them.

**The shared read never touches `doc`.** It reads the projection columns, and
that distinction is the point: `doc` is the whole campaign — house rules, week
log, games — and a member is entitled to the arsenal, which the rules make
public (p.14), not to the rest of it. A test asserts no statement in that path
mentions `doc`. Migration 0003 widens the projection with `injuries`,
`equipment` and `totem`, which also closes half of the standing to-do from
0002; the reason for deferring (Aftermath would reshape them) expired when
Aftermath shipped.

`listSharedArsenals` is five statements regardless of how many players are in
the campaign, per §12b and D1's 50-query cap. Asserted.

**Not local-first, deliberately.** Every other network path here caches, because
a campaign must survive being offline. Membership does not: it is the answer to
"who may see my data", and a stale answer to that is worse than no answer.
Offline, the Players tab says so and the rest of the app carries on.

The invite link is `?invite=<token>` on the app's own origin rather than
`/join/<token>`: this is an SPA on Pages, a real path needs a rewrite rule to
reach the app at all, and a rule nothing tests is a thing to get wrong. The
token stays in the URL while signed out — sign-in reloads the page and it has to
survive the round trip — and is cleared with `replaceState` the moment it is
spent, so a reload does not retry a dead token and the back button is not left
pointing at one.

`SharedArsenal` is a new component rather than a reuse of `ArsenalSheet`. The
sheet renders a live campaign — it reads the register for action values,
resolves crew cards, and expects `campaign.games` — and none of that crosses the
member boundary. Feeding it a half-shaped object would either throw or, worse,
render blanks that look like facts.

#### Verified

317 tests (up from 258), build clean.

Migration 0003 applied to a fresh local D1, then the whole flow driven over real
HTTP against `wrangler pages dev` with three forged sessions — the same
technique used to prove D1 sync in v0.7.0, since Discord still has no preview
redirect URI. Confirmed: a stranger is refused before and after a member joins;
a pending member reads nothing; a replayed token is refused; a member cannot
admit themselves, remove another player, link a campaign they do not own, or
link at all before being admitted; cross-origin writes are refused; the host's
Discord name, avatar, user id and `doc` never appear in what a member receives;
opting in and back out of identity sharing works both ways; and leaving unlinks
the departing player's campaign so their arsenal leaves the shared page.

The local test database was deleted afterwards. **Nothing was run against the
remote database**, which still has only the owner's real account on it.

#### Still to do

- **Migration 0003 has not been applied to the remote database.** It must be,
  before this deploys: `npx wrangler d1 execute hodgepodge-hearthside --remote
  --file=./migrations/0003_membership.sql`. Until then the membership endpoints
  will 500 in production while everything else carries on.
- The shared page shows arsenals, not encounter sizes. `maxEncounterSize` is
  right there and the numbers are now on screen together; a "you two can play a
  33-stone game" line is a small addition and the reason the rules make arsenals
  public in the first place.

---

### Session 39 — v0.18.0
Date: 2026-08-31

**fix: the sync bug that lost a portrait, and a build stamp in the footer**

The owner signed in on Chrome and found none of the leaders they had built on
mobile and in Edge, and noticed a leader portrait had gone missing. Both came
from one root cause, and the investigation is worth recording because the code
looked correct.

#### The stale closure

`useSync`'s `reconcile` was `useCallback(async () => {…}, [onChanged])`.
`onChanged` is `useCampaign`'s `refresh`, a `useCallback` with an empty
dependency list — stable for the life of the app. So `reconcile` was built
**once, on the first render, while `useAuth` was still loading and `user` was
null**, and every reconcile afterwards ran against that closure.

The effect could not notice. Its own closure is fresh, so it checked a real
user, set `reconciledFor`, and called a function that could not see one. Then:

- `belongsTo(c, user?.id)` matched only unclaimed campaigns
- the pull loop hit `{ ...campaign, ownerUserId: user.id }` → TypeError on null
- nothing caught it: `remote.list()` had a try/catch, everything after it had
  none
- unhandled rejection, status stuck on `syncing`, `at` never stamped, `settled`
  never true

From outside that looked like nothing happening: **"Checking your account for
campaigns…" for ever, 0 on file**, while the campaign sat on the server intact.

`mirror`'s deps were correct, so **pushes worked and pulls did not**. Data went
up and never came back down, which is exactly the shape of the owner's report.

Reproduced by reverting only the deps: with a campaign waiting on the server,
the app not only failed to pull it but **invented a blank leader** and dropped
into the creation wizard.

#### What that exposed on the way past

Fixing the hang meant a failed reconcile now stamps `at`, so it settles. That
made `App`'s "no campaigns yet, build someone" branch fire on a *failed* sync —
inventing a blank leader because a network call failed. `settled` and "we know
what is on the shelf" turn out to be different questions, so `useSync` now
exposes **`knowsShelf`** (settled **and** not failed) and `App` uses that.

#### The portrait, and optimistic concurrency

`planSync` compares `updatedAt` carefully to decide which copy of a campaign
survives a reconciliation — and `mirror` then pushed on **every local save with
no comparison at all**. With pulls broken, Edge held a copy that had never
learned about the portrait, and the next save there overwrote the server's good
copy with it.

`putCampaign` now takes a `baseVersion` and refuses a write from a client that
has not seen the copy it is replacing, returning 409 with the server's version.
Two refusals, and the second matters more than it looks:

- the row moved on since the client last saw it → stale
- a row exists and the client has **no** base version → also stale. It has
  never seen the server's copy, so it cannot be replacing it knowingly. Every
  existing install hits this once, pulls, and carries on — which is the
  reconciliation whose absence caused the loss.

**`baseVersion` is the version the server last told the client about, never a
timestamp the client invented.** That is the whole point: a client clock can be
wrong by minutes, but "the version I was handed" is not subject to skew at all.
Proven by attacking it — a stale client claiming `updatedAt: 9999999999999` is
still refused, because its clock is not consulted.

#### The version had to leave the document

First attempt stored it as `campaign.syncedAt`, and testing the real path caught
it inside a minute: **the next keystroke wiped it**. `useCampaign` holds the
campaign in React state and writes that state to storage on every edit, and that
state has never heard of a field the sync layer added behind it. So every save
after the first pushed with no base version, was refused, and could never
recover — a permanent 409 loop, visible in the network log as two consecutive
conflicts on the same campaign.

It does not belong in the doc on principle either: it is per-device sync
bookkeeping, not campaign data, and would otherwise ride into the JSON export
and into `doc` on the server, where it means nothing and is wrong the moment the
file is imported elsewhere. It now lives under its own `campaign-version:<id>`
key, and is forgotten when a campaign is discarded — or a later re-import of the
same id would look like a copy this device had already seen.

Two bugs found by their own tests, both worth keeping:

- `typeof NaN === 'number'` is true, and `existing.updated_at > NaN` is false,
  so a NaN base version read as "no conflict" and waved the write through. Now
  `Number.isFinite`.
- An unanchored `/UPDATE/i` in a test matched the `updated_at` column in the
  gate's own SELECT, so an assertion that nothing was written looked like a
  failure. Anchored.

#### The build stamp

Owner request, and it earns its place: **is the thing I just pushed the thing I
am looking at?** could not be answered from the page. `vite.config.js` now bakes
version, commit and build date in, and `BuildStamp` prints them under the
colophon.

The commit is the load-bearing half. A version number only moves when someone
remembers to bump it — `package.json` was sitting at **0.8.0** while CLAUDE.md
said 0.17.0, found while wiring this up and now corrected to 0.18.0 — whereas
`CF_PAGES_COMMIT_SHA` is set by Cloudflare on every build and cannot be
forgotten. If the footer's commit matches what was pushed, the deploy landed.
Locally it reads `dev · local`, which is honest: Vite built it from the working
tree, uncommitted changes and all.

328 tests, build clean. Verified against a local D1 over real HTTP: the exact
attack that destroyed the portrait is refused and the portrait survives; a
client holding the current version writes successfully; replaying that same
version is then refused; a fresh device pulls and records the version; and three
consecutive saves push cleanly where the first attempt produced two 409s.

#### Still open

- **`updatedAt` is still a client clock** where `planSync` uses it to choose a
  winner. The version check stops a *blind* overwrite, which was the mechanism
  that lost the portrait, but two devices editing the same campaign at once
  still resolve by comparing clocks. A monotonic server-assigned version on
  every campaign would retire that; the pieces are now in place for it.
- **The lost portrait is not recoverable from the server.** The owner was told
  to export the JSON from whichever device still holds it before letting it
  sync, since a pull would otherwise overwrite the last copy.

---

### Session 39b — v0.18.1
Date: 2026-08-31

**fix: the version check deadlocked every device that already held work**

Shipped v0.18.0, and the owner immediately hit the failure it introduced: the
leader appeared, and the shelf then said "Saved here, but not to your account —
This campaign has changed since you last saw it" permanently, with no way out.

The version check requires `baseVersion` to be a version the **server** stated,
which is right. But v0.18.0 learned one from exactly two events — a pull, or an
accepted push — and that is a trap. A device whose local copy is *newer* than
the server's reaches neither: it never pulls, because it is ahead, and its push
is refused, because it has no base version. Permanent stalemate.

The session note claiming "every existing install hits this once, pulls, and
carries on" was wrong, and wrong in a way worth naming: it only pulls if the
*remote* is newer. Every device holding unpushed work was on the other branch.

`remote.list()` is the third statement of a version and the one that breaks the
cycle — the listing carries `updatedAt` for every campaign, which *is* the
server saying what it holds. `useSync` now records those before deciding what to
push, so the push that follows has a legitimate base version.

That is not a loophole in the check. `baseVersion` still has to come from the
server; this is the server, one request earlier. If another device writes in the
gap between the listing and the PUT, the stored `updated_at` moves past what was
recorded and the write is refused — the check working, not bypassed.

Also: a stale conflict that does surface no longer shows the server's wording.
"Pull before pushing" is an instruction to a program, not to somebody reading a
shelf; it now reads "Another device saved this campaign a moment ago. Nothing is
lost; try again."

331 tests. Verified against a local D1 by reconstructing the owner's exact
state — a local copy ten minutes newer than the server's, with no recorded
version — and confirming it pushes, records a version, keeps its portrait, and
then accepts three consecutive edits with no warning.

**The lesson worth keeping.** v0.18.0 was tested thoroughly and still shipped a
deadlock, because every test started from a device that had just pulled. The
untested state was the one every real device was actually in: holding work the
server had not seen. When adding a precondition, the case to test first is the
population that already exists, not the one the happy path creates.

---

### Session 39c — v0.18.2
Date: 2026-08-31

**fix: a shelf with campaigns and none open stripped the masthead to Leaders**

The owner reported the navigation reduced to a single "Leaders" tab and asked
why it kept happening, having seen the same symptom before.

It was **not** the earlier bug returning. v0.15.x fixed `shouldRelease` closing
an open campaign while auth was still loading, and that fix is intact. This was
a different, never-fixed gap with the same symptom — worth recording precisely
because the two look identical from outside.

`inCampaign` is `openId && leader`, and every tab but Leaders is gated on it. So
the navigation collapses whenever nothing is *open*, which is not the same as
having nothing. And **no code path ever opened a campaign automatically**:
`openId` only became non-null by clicking View arsenal, building a leader,
importing JSON, or reloading with `campaigns:active` already set.

Two ordinary routes therefore left a populated shelf with nothing open:

- a campaign that **arrived by sync** — `refresh` re-reads the shelf and
  deliberately opens nothing, and never sets `campaigns:active`
- **discarding the open campaign** while others remained — `discard` nulls
  `openId` without falling through to what is left

§12b's rule covered only the first half of this: "switching to the shelf must
not close the open campaign." Nothing said what should happen when none is open,
and the answer turned out to matter just as much.

`App` now opens the most recently updated campaign when the shelf has settled
with something on it and nothing open. **It does not navigate** — the view stays
put, so the change is invisible except that the tabs are there. Picking a
campaign for somebody is only presumptuous if it also moves them, and opening a
different leader from the shelf still replaces it, which remains the only close.

Verified against a local D1: a fresh device whose campaigns arrive purely by
sync lands with all five tabs and the view still on Leaders; and discarding the
open campaign with another present moves the active id from the discarded one to
the survivor with the navigation intact.

331 tests, build clean.

---

### Session 39d — v0.18.3
Date: 2026-08-31

**fix: the leader's characteristics were eight, three of which do not exist**

The owner found a complete list of the game's characteristics and asked for it
on the leader creation screen. What was there was eight hard-coded chips —
Living, Undead, Construct, Nightmare, Beast, Spirit, Puppet, Mimic — carrying
the comment "Common characteristics a player might give a leader. Free text is
also allowed." Both halves of that comment were wrong: there is no free-text
field, and three of the eight are not characteristics.

#### Go and look

CLAUDE.md §6's rule — *if you find yourself reasoning about what the register
returns, fetch it instead* — is what settled this, and it is the third time now
that one API call has retired an argument.

Every character in all eight factions was fetched and its `characteristics`
tallied: **798 characters, 23 distinct values.** Exactly the 23 in the owner's
screenshots, which also proves nothing was hidden behind the scrollbar in them.
The counts are recorded in `src/data/characteristics.js` so a future reader can
tell an odd entry from a typo — `plant` really does appear once.

The same pass condemned three of the eight:

- **Nightmare** is a *keyword*, not a characteristic — `/keywords?search=`
  returns it.
- **Spirit** and **Mimic** are neither, in Fourth Edition. They are Second and
  Third Edition vocabulary that survived in this file by memory.

#### The book does not restrict the list, so neither does this

p.17: "Your leader automatically gains the master characteristic. In addition,
you may choose up to two characteristics (such as living or construct)." It
names no list, gives two examples, and forbids nothing — the mode
"unapologetically leaned into creativity and freedom" by its own introduction.
The existing label, *up to two, master is automatic*, was checked against that
sentence and is right.

Four of the 23 nonetheless sit oddly on a leader, and narrowing the game's own
list is the owner's call rather than the app's. It was put to them and three
were cut — **Totem**, **Versatile** and **Henchman**, now `NOT_ON_A_LEADER`.
Each contradicts a rule this project already holds rather than merely reading
oddly:

- **Totem** — a totem is a separate model with its own section on the arsenal
  sheet, reached only through the tier-3 advancement table. Offering it on the
  leader would say the leader is its own totem.
- **Versatile** — it means "hirable regardless of keyword", and the leader is
  never hired: "Players do not spend any soulstones to add their leader into
  their arsenal."
- **Henchman** — a station, and the leader's is master, which `ArsenalSheet`
  appends without asking. Both cannot be true.

**Unique was deliberately kept.** It is true of a leader either way, so spending
one of the two saying so is a waste rather than a contradiction — and that is
the player's waste to choose.

The two lists are kept apart in the file on purpose. `CHARACTERISTICS` is a fact
about Malifaux, verified against the register; `LEADER_CHARACTERISTICS` is a
house rule derived from it. A later reader has to be able to tell which is
which, and a test asserts that every excluded name is a real characteristic —
a typo there would silently exclude nothing.

#### The part that would have bitten

Deleting Nightmare, Spirit and Mimic from the array is not sufficient, and the
failure is silent. A leader created before this change may **hold** one — and
the same is true of the three exclusions, which can arrive on an imported JSON,
a file this app does not get to vet. Drawing only the offered list would leave
that value on the leader and off the screen: still printed on the record and the
arsenal sheet, still counting against the limit of two, and with no chip to
switch it off. A stuck characteristic is worse than a disallowed one.

`characteristicOptions(selected)` is the whole fix — the 20 on offer plus
anything already selected, sorted. Switch the stranger off and it leaves the
list, because it is not on offer and there is no route back. A one-way door,
deliberately. **Nothing rewrites the stored value**; quietly editing somebody's
leader to tidy a list is not a thing this app does.

Sixteen tests, and they assert the *shape* rather than the contents. A test
re-listing all 23 names would be transcribed from the same source as the list
and would agree with it however wrong both were — the trap CLAUDE.md names about
the book's data files. What is pinned instead is what a hand edit could break:
the count, the sort order, the absence of duplicates, Title Case, the three
retired names staying gone, the three excluded ones being real characteristics,
and the one-way door.

347 tests, build clean. Verified in the browser against a real leader: the chips
render in two rows at 1200px with no horizontal overflow; picking two disables
the rest; and with a value injected into storage that the list does not offer,
it draws in alphabetical position already selected, one click removes it, the
list returns to its normal length and storage returns to `[]`.

#### Noticed, not built

The book grants the **totem** "up to two characteristics… in the same manner as
for your leader" (p.32). `createTotem` carries the field, `ArsenalSheet` prints
it, and nothing anywhere sets it. `characteristicOptions` takes a `base` for
exactly this — a totem's excluded set is not the leader's, since a totem plainly
may be a Totem — so what is left is the component.

---

### Session 39e — v0.18.4
Date: 2026-09-01

**fix: opening a campaign counted as editing it, so looking at your data destroyed it**

The owner reported that a leader would not update in Edge — the portrait was
missing and the week was wrong — while Chrome and their phone both showed it
correctly. Clearing cache and cookies, then clearing site data and unregistering
the service worker, changed nothing.

None of the obvious explanations survived contact with the evidence, and the
sequence of eliminating them is the useful part of this entry.

#### It was not a stale build

The live bundle was fetched and read rather than trusted: `version:"0.18.3",
commit:"0c49e59"`, matching what had just been pushed. The footer in Edge read
the same. `BuildStamp` did exactly the job it was added for.

#### It was not Edge showing stale data

The server's copy was 2143 bytes. A portrait is a WebP data URL of ~15 KB, so it
could not have been in there. The `leader` object had no `portrait` key at all —
not even the `null` that `createLeader` always emits — and no `weekMode`, so the
week fell back to calendar and computed 2 instead of the stored manual 1. **Edge
was rendering the server faithfully. The server was the copy that had lost the
portrait.**

#### It was not the member who had just joined

A real person had redeemed an invite an hour earlier and was `active` on the
campaign, which made them the natural suspect. They were innocent, and it is
worth recording how that was settled rather than argued: every write in
`membershipStore.js` touches only `campaign_invites`, `campaign_members`, or
`campaigns.member_of`, and both `member_of` writes are scoped
`WHERE id = ? AND owner_user_id = ?`. Nothing in the membership API can reach
the host's `doc` or house rules, and `putCampaign`'s ownership gate returns
`forbidden` for a cross-account write. The bad copies were all stamped with the
**owner's** `owner_user_id` — written by their own sessions.

#### What it actually was

`useCampaign`:

```js
const lastWritten = useRef(null)
useEffect(() => {
  if (!campaign) return
  if (lastWritten.current === campaign) return   // identity
  lastWritten.current = campaign
  const stamped = saveCampaign(claimed)          // updatedAt = Date.now()
  if (stamped) onSaved?.(stamped)                // → mirror → push to D1
}, [campaign, onSaved])
```

The comment above it read *"Skip the write on the render that merely opened a
campaign."* It never did. Every read path — the mount initialiser, `open`, and
`refresh` after a pull — builds a fresh object via `loadCampaign`, so
`lastWritten.current === campaign` was false on the first render after every
single load. The write fired, `saveCampaign` stamped `updatedAt: Date.now()`,
and `onSaved` mirrored it to the account.

**Loading the page re-stamped the campaign as the newest copy in existence and
pushed it.** Since v0.18.2 `App` auto-opens the most recently updated campaign,
so no interaction was needed at all.

`planSync` picks a winner by comparing `updatedAt`. A device sitting on a stale
copy therefore won every merge, because its timestamp was always *now*. The loop
this creates is the nastiest part: **reloading the page to check whether your
data had arrived was the thing that destroyed it.** The server was observed
being overwritten at 05:35:59, 05:52:24 and 06:00:04 — each one a reload.

#### Why v0.18.0's guard did not stop it

`putCampaign` refuses a write from a client that has not seen the copy it is
replacing. But `useSync` records the server's version for *every* campaign from
the listing **before** `planSync` decides, so a client always holds a version
the server told it, and the gate always passes.

The contract — *"has this client seen the copy it is replacing?"* — became true
of the **device** while remaining false of the **document**, which had merged
nothing. **A guard phrased about a client but enforced against a document will
pass every time.** The version deadlock fix in `2aa6a2a` is what introduced the
unconditional recording, so the commit that repaired one failure re-opened the
one beneath it.

#### The fix

`lastWritten` is now seeded at all three read sites — the mount initialiser,
`open`, and `refresh` — with a comment explaining that identity comparison only
works if every read path seeds it. Reading is not editing.

This also repairs `planSync` without touching it. The clock comparison was only
ever dangerous because the timestamps were lying; once a device stops
manufacturing fresh ones for copies it merely looked at, an older copy stays
older and correctly loses.

#### Recovery

The owner's data was restored by writing their exported JSON straight into
`campaigns.doc` with a fresh `updated_at`, scoped by `id` **and**
`owner_user_id`, after backing the broken row up. The row id was deliberately
preserved rather than re-importing: import mints a fresh id by design, and both
`campaign_members` and `campaign_invites` cascade on delete, so discarding and
re-importing would have silently ejected the member and burned their single-use
invite. **A recovery that loses somebody else's seat is not a recovery.**

The `arsenals` projection stayed stale through this — it is what the shared page
reads, and only the app's own save path refreshes it. Restoring `doc` by hand
fixes the owner's view and leaves the members' view behind until the next real
edit, which is worth knowing before doing it again.

347 tests, build clean. Verified in the browser against a seeded campaign with a
known `updatedAt`: page load, a second page load, `open`, and tab navigation all
leave it untouched; typing in the leader name stamps it to now and preserves the
portrait.

#### Found on the way past, not fixed

- **There is no error boundary.** A campaign with `crewCard: null` — which an
  imported JSON can carry, since imports are not vetted — throws in `Arsenal`
  and blanks the entire app. React said so in the console. One bad field
  should not cost the whole page.
- **Migration 0003 was already applied on remote**, and CLAUDE.md had carried it
  as ⚠ BLOCKING for several versions. Corrected.
- **The remote database has five users now**, not one. §5's "first non-you user"
  audit trigger fired without anyone noticing.
- `member_of` is `null` on the member's campaigns and their `nickname` is empty,
  so the shared arsenal page has nothing to show them yet.


---

### Session 39f — v0.18.5
Date: 2026-09-01

**feat: the merge stops comparing clocks, and one bad field stops costing the whole page**

Both items the owner asked for after v0.18.4, in the same session, because the
first one is what makes the app trustworthy and the second is what makes it
survivable when it is not.

#### Versions, not clocks

Migration `0004_campaign_version.sql` adds `campaigns.version` — a
server-assigned integer, incremented on every accepted write, that a client can
only learn by being handed it.

`putCampaign`'s gate is now exact equality rather than `existing.updated_at >
seen`. The old form looks like a concurrency check and is not one: it could be
satisfied by a client that had merely been *told* a version, which is exactly
what `useSync` did — recording one for every campaign in its listing, before
deciding anything. So the contract *"has this client seen the copy it is
replacing?"* was true of the **device** and false of the **document**, and every
push passed. **A guard phrased about a client but enforced against a document
will pass every time.** That is the whole lesson of v0.18.4 and v0.18.5
together, and it is why the version had to become a thing the *document*
descends from.

`useSync` no longer records versions from the listing. A version is recorded
only where content actually arrives — on a pull, or on a push the server
accepted. The deadlock that unconditional recording was fixing (`2aa6a2a`) is
gone by a better route: `planSync` now asks whether a copy is *dirty*, so a
device that is merely ahead in clock time does not try to push at all.

`planSync` takes `baseOf` and `isDirty` and has four honest outcomes:

| local | server | outcome |
|---|---|---|
| clean | ahead of my base | pull |
| edited | still at my base | push |
| edited | ahead of my base | **conflict — refuse to pick** |
| clean | at my base | nothing |

**A conflict is reported and never resolved.** Neither copy is written. This is
the correction that matters: choosing a winner quietly is how a portrait was
destroyed twice, and an app that says "these disagree" beats one that guesses
right most of the time. Resolving needs a person, because only a person knows
which twelve weeks are the real ones.

A deliberate tightening fell out of it: a client claiming a version *ahead* of
the server is now refused. Under `>` it was waved through as harmlessly
current. It is not harmless — versions are only ever issued by the server, so a
client holding one that was never issued is confused or lying, and neither earns
the right to overwrite somebody's campaign.

`isDirty` returns `null` for "nobody has ever said", kept distinct from
`false`. Treating unknown as clean would license a pull over an offline edit
made before the flag existed. Where any of the three facts is missing,
`planSync` takes the old clock comparison rather than reasoning from half a
picture — bounded, because one pull retires the bridge per campaign per device.

The dirty flag lives in `campaign-dirty:<id>`, beside the version and for the
same reason: a flag on the doc is wiped by the next keystroke, since
`useCampaign` writes React state to storage and that state has never heard of
fields the sync layer adds behind it. It is also not campaign data and would be
meaningless inside an export.

#### An error boundary, with a way out

There was none, and React said so in the console every time. The cost was found
by accident while testing the above: a campaign carrying `crewCard: null` threw
inside `Arsenal` and rendered the **entire app blank** — masthead, navigation,
every other campaign, and the legal disclaimer with them. An imported JSON can
carry exactly that, and imports are not vetted (§12b).

`ErrorBoundary` wraps the views only, inside `<main>`. The disclaimer and the
build stamp sit outside it on purpose: §8 requires the disclaimer on every page
and a crash is not an exemption, and the first useful question about any crash is
which build produced it — an answer that should be on the screen the person is
already looking at.

It also offers to **download every campaign**, read straight out of localStorage
with no hooks and no React state, so nothing it depends on can be part of what
just broke. §8 treats portability as a requirement rather than a courtesy, and
the moment it matters most is the one where the UI is gone. It deliberately does
not offer to delete anything: a recovery screen should never carry the
destructive option, however tempting "clear it and start again" looks while
staring at an error.

#### Verified

358 tests, build clean. Migration 0004 applied to remote before deploying, since
the new reads select a column that would otherwise not exist.

In the browser: seeding a campaign with `crewCard: null` and opening the
arsenal now shows the boundary with the real error text, while the masthead, the
disclaimer and the build stamp all keep rendering, and the rescue button offers
the campaign.

The two tests worth reading are the ones that encode the bug rather than the
fix: `pulls even when the local clock claims to be far newer` (a device with
`updatedAt: 9999999999` and a stale version still pulls) and `pushes an edit
whose clock is behind the server it is based on` (a slow clock no longer costs
you your unsent work). Both were wrong before this session.

---

### Session 40 — v0.19.0
Date: 2026-09-02

**feat: the arsenal becomes its own object, in a module nothing imports yet**

Step 1 of `docs/data-model-v3.md`. The pure shape and the v2→v3 migration, with
tests, and **no component touched**. `src/lib/campaignShape.js` is still what the
running app uses; the new module sits beside it until the cutover.

That restraint is the whole shape of this session. The plan doc's order of work
says build the shape, migrate locally, play a real week, *then* touch D1 — and
the reason is written into three separate places in `CLAUDE.md`: schema built on
guesses is expensive once anyone has saved data, and other people have now saved
data. Wiring the UI in the same session as the shape would have made both
untestable at once.

#### What the split actually is

Three concepts where there were one and a half:

- **Arsenal** (`src/lib/shape/arsenal.js`) — the durable personal object. The
  book's arsenal sheet: leader, models, scrip, injuries, equipment, experience,
  advancements, totem. Owned by one person, exists before any campaign.
- **Campaign** (`shape/campaign.js`) — the table. Weeks, week mode, house rules,
  participants, games. Nothing personal.
- **Participation** — `(campaign, user, arsenal)` plus nickname, `shareIdentity`,
  `status` and `joinedWeek`. This is what `campaign_members` already is.

It retires `campaign.arsenals[]`, `campaign.localArsenalId`, `campaign.members[]`
and the reason `campaigns.member_of` existed at all.

**D1 has believed this since migration 0001** — `arsenals` has always had its own
table with both `campaign_id` and `user_id`. This is the client document moving
toward the schema already underneath it, which is a much smaller claim than a
rewrite and is the strongest argument for doing it.

#### The four open questions, settled

1. **A solo player gets an implicit campaign of one**, created silently.
   `createCampaign` starts with no participants and gains one when an arsenal is
   seated, so soloing and a table of five are one code path. The special case is
   the thing that rots.
2. **The campaign owns the week; the participation owns `joinedWeek`.** A group
   agrees when week four is — two players disagreeing about it *is* the bug. But
   an arsenal that joined in week four was not delinquent in weeks two and three,
   so `mustHireThisWeek` takes `joinedWeek` and defaults it to 1.
3. **A deleted campaign never cascades.** The arsenal survives with
   `campaignId: null` and its history intact. Deliberately a patch on the arsenal
   rather than a cascade on the campaign: two documents are two writes, and a
   function pretending otherwise would be pretending to a transaction it cannot
   have.
4. **A host may not see a pending member's arsenal.** `visibleArsenalIds` runs
   the rule both ways — a pending player sees only their own, a stranger sees
   nothing — and it is asserted. If admitting did not gate reading, the first of
   the two membership gates would be decorative.

Also settled, and it is a restraint rather than a feature: **an arsenal may be in
at most one campaign at a time.** `joinCampaignPatch` throws rather than
reassigning. Scrip, weeks and experience are per-campaign quantities; a leader in
two campaigns has two contradictory histories and the arsenal sheet cannot print
either. Wanting the same leader at a second table is `duplicateArsenal` — the
identity and the surviving models, none of the history, new ids throughout.

#### The trap the migration found in itself

`readBundle` decided "is this a bundle?" by looking for an `arsenals` array. **A
v2 campaign is also an object with an `arsenals` array.** So a bare v2 export —
the oldest and most likely file anyone still has — was read as a bundle: the
campaign discarded, and the arsenals that had been *inside* it filed as though
they were top-level. Silent loss, on the one path whose entire purpose is to
prevent loss.

Caught by its own test, before anything imported it. The fix is that the bundle
test is narrow (`format`, or a `campaigns` array) and the legacy-campaign test
runs first. Worth remembering: the two shapes overlap on exactly one field name,
and the next person to touch that function will meet it again.

The same care shows up as `defined()` in `shape/arsenal.js`. Every factory here
spreads its patch last, so `{ id: undefined }` overwrites the id it just minted
and the save silently no-ops — the `createCampaign` bug from audit v0.5.2. The
rule is strip keys, do not blank them, and now there is a tool for it and a test
that says so.

#### `scripts/migrate-check.mjs`

The plan doc's step 2 is blunt: *"`migrateLeaderToCampaign` has never been run
against anything but a synthetic record. Do not add a second unverified lift on
top of it. Run v3's migration against real exported JSON from the live account
before trusting it."*

So there is now a script for exactly that. It reads a real export and asserts
**conservation** per campaign — models, injuries, equipment, scrip, experience
boxes, advancements and games all still present, every model carrying an id,
every arsenal seated at the table it came out of, and both ids unchanged. It
writes nothing, opens no network connection and touches no browser storage, so it
is safe to point at the only copy of somebody's twelve weeks. Exit code 1 if
anything broke.

Ids are the part worth being loud about: **the lift preserves them.** The arsenal
keeps its `ars_…` and the campaign keeps its `cmp_…`, because `arsenals` rows
already exist on D1 under those ids. Re-minting would have doubled every row on
the server the first time a device synced after upgrading.

#### Went to the book rather than reasoning about it

The owner asked for scrip from an under-spent pre-game hire. Checked the PDF
instead of deciding it sounded right, per §6's *"where a claim is about an
external source, go and look"*, and the answer is no. Two rules, one scrip:

- **p. 18, starting arsenal** — each unspent soulstone becomes one scrip, max
  three. Already implemented as `startingScrip`.
- **p. 19, hiring for an encounter** — *"Players may use excess soulstones from
  hiring to increase their pool as normal."* Leftovers become soulstones in that
  game's pool and never scrip. The book's worked example has Jack and Jill
  underspending by 3 between them and starting with 3 stones to share.

So it is a house rule (`unspentHireBecomesScrip`, default off, with a
`.gap-note`), not a missing feature — the same treatment §13 gives the hire-cost
gap. The genuinely missing half is that nothing currently *shows* the leftover at
all, which is why it read as lost value.

#### Designed, not built

`docs/data-model-v3.md` gained two sections from the owner's first real game:

- **The crew builder with a shared session.** An encounter is a thing that
  happens between two *arsenals* at a *table*, which is what a participation
  joins — it could not have been modelled cleanly before this split. Four rules
  written down before anyone writes the screen: hidden-then-revealed hiring
  (p. 19 works the rating out *after* revealing), hire only from your arsenal
  with leader and totem at 0, the campaign rating stops being typed in because
  the encounter finally knows every term of it, and resolving an encounter
  creates the game.
- **Three aftermath changes.** Record the hand as cards and spend them (still no
  fate deck — every card typed in, no "flip for me" button, ever); show the
  leftover soulstones; and make the aftermath go backwards and then lock. The
  third is not a Back button — it is a change of where truth lives. Every phase's
  effect on the arsenal must be *derived from the record and reconciled*, not
  appended when a button is pressed. Only `paid` and `advance.applied` guard
  anything today; barter, the doctor and the injury flips all append and would
  double on a revisit.

#### The audit, and why §5 stopped working

§5 said the next audit was Session 39. Sessions 39, 39b, 39c, 39d, 39e and 39f
shipped without it. **The lettered-suffix habit is the mechanism**: six sessions
all called "39" read as one session, and the counter that decides when an audit
is due quietly stopped counting. Sessions are numbered plainly from here.

§5's third trigger has also been rewritten to the wording the previous note
demanded — *a new top-level module, a change under `functions/`, or the first
write of a shape that persists* — instead of "8+ files or a shared module", which
fired on nearly every feature session and was ignored every time. This session
trips the new wording, which is the point of it.

The audit itself is recommended **after the v3 cutover**, on the argument that
the §5 ritual reads every file in `src/` and a large fraction of `src/` is about
to be deleted by item 0. If the cutover slips more than two sessions, run it
anyway — that argument expires the moment "about to be replaced" stops being
true.

Files (v0.19.0): `src/lib/shape/{arsenal,campaign,ownership,migrate}.js` + three
       test files, `scripts/migrate-check.mjs`, `docs/data-model-v3.md`, `CLAUDE.md`

#### Then, same session — v0.19.1: the starting scrip was never paid

The owner clarified what they had actually meant by "scrip from the pre-game",
and quoted p. 15. It was the **starting arsenal**, not hiring for an encounter,
and the earlier answer in this entry — "the book says no, so it is a house rule"
— was answering the wrong rule.

Both are worth keeping straight, because the app must behave differently for
each:

| | |
|---|---|
| **p. 15**, starting arsenal | unspent soulstones → **scrip**, capped at 3 |
| **p. 19**, hiring for an encounter | excess soulstones → the **soulstone pool** for that game, never scrip |

The p. 19 finding stands and is unchanged. The p. 15 half was a real bug.

**`Record` has computed the number since v0.1 and never written it anywhere.**
The creation screen printed "22/25 spent · 3 scrip" in its tally and
`arsenal.scrip` stayed at zero. That is the worst form of this bug: the display
was right, so a player has no reason to doubt it and every reason to wonder why
the campaign disagrees. Confirmed in the browser before touching anything — a
seeded 22ss arsenal showed `22SS · 0 SCRIP` on the shelf.

There was a quieter second half. The tally totalled **every** model rather than
the week-0 ones. During creation those are the same list, so it looked correct
forever; open the same screen in week three and a 40ss roster reads as the
starting arsenal, the grant computes to zero, and a player who *had* been paid
would have had it taken back off them. `startingArsenalSpend` counts week 0 only
— and deliberately still counts a starting model that has since been
annihilated, because the soulstones were spent and a death in week four does not
make the starting arsenal retroactively cheaper. That is the opposite of what
`totalFor` needs, which is why they are two functions over one list rather than
one function with a flag.

**Reconciled, not appended.** `startingScripPatch` derives the grant from the
starting arsenal, `startingScripGranted` records what has already been paid, and
the patch moves the balance by the difference. Adding a model afterwards takes
the change back; removing one pays the difference; calling it ten times pays
once. Appending would have been three lines shorter and would have double-paid
the first time anyone edited their starting arsenal twice — the same mistake the
aftermath phases are queued up to be fixed for, and worth not making twice in one
session.

`startingScripGranted: null` means *never reconciled*, which is deliberately not
`0` (*reconciled, and the grant was nothing*) — the same null-versus-false
distinction `isDirty` makes in `storage.js`, for the same reason: guessing
"already paid" about an arsenal nobody has asked would quietly keep somebody's
scrip.

**Existing arsenals are offered it, not given it.** Everyone already playing is
owed up to 3. Paying on load would move a number in an in-progress campaign with
no explanation, which is indistinguishable from a bug, and the database is no
longer only the owner's. So `owedStartingScrip` drives a note on the creation
screen that states the rule and offers a button; the player decides.

Verified in the browser, not asserted: the note rendered as "This arsenal is owed
3 scrip", the button wrote `{ scrip: 3, startingScripGranted: 3 }` to
localStorage, the note then disappeared (so it cannot double-pay), and the shelf
re-read `22SS · 3 SCRIP`.

Sixteen new tests across both shapes — the v2 one the app runs on today and the
v3 one it will run on after the cutover, so the fix survives item 0 rather than
having to be found again.

Files: `src/lib/campaignShape.js`, `src/lib/shape/arsenal.js`,
       `src/hooks/useCampaign.js`, `src/components/steps/Record.jsx`,
       `src/App.jsx`, both test files, `docs/data-model-v3.md`, `CLAUDE.md`
RESOLVED: data-model-v3's four open questions; §5's loose third trigger; the
p. 15 starting scrip, unpaid since v0.1.
UNVERIFIED: the v2→v3 lift against a **real** export — the script exists, the run
has not happened. Everything in `shape/` is still unexercised by the app.
NEXT: run `migrate-check` on a real export, then the UI cutover with sync off,
then the audit.

#### Then, 2026-09-03 — a restore point, and step 2 finally run for real

Before the v3 cutover touches anything, the live database was backed up. Two
artifacts, both in `backups/`, which was added to `.gitignore` **before either
file existed** so there was never a moment when a dump was committable.

`wrangler d1 export --remote` gave the full schema and data: 11 tables, 58 rows,
5 users, 6 campaigns, 6 arsenals, 23 arsenal models. `injuries`, `equipment` and
`games` came back **empty**, exactly as migration 0002 predicted — they were
never normalised, so the real campaign data lives entirely inside
`campaigns.doc`. That is why a second artifact exists: the six documents pulled
out into the app's own import format, which is the one a player can actually be
handed back.

**The dump is a credential file, not just data.** `sessions` has 16 rows and its
`id` column *is* the session cookie value, so anyone holding the file can sign in
as any of those five people until the rows expire. `users` carries other people's
Discord ids, display names and avatar URLs. This repository is public. Hence the
gitignore-first ordering, and `backups/README.md` saying so at the top rather
than in a footnote.

**Verified rather than assumed, in both directions.** The `.sql` was loaded into
a throwaway SQLite database: it applied without error, produced all 11 tables
with the expected row counts, and all six campaign documents parsed with a leader
intact. A backup nobody has restored is not a backup.

Then **step 2 of `docs/data-model-v3.md` was finally run against real data** —
the thing the plan called not optional, and that had been sitting as UNVERIFIED
since the shape was written. `migrate-check` passed on all six live campaigns:
every model, injury, equipment row, scrip total, experience box, advancement and
game survived the split, every model carried an id, every arsenal was seated at
the table it came out of, and **both ids were preserved on all six** — which is
the one that matters, because a re-mint would have doubled every row on the
server the first time a device synced after upgrading.

Step 3, the UI cutover, is now unblocked.

Two facts worth carrying into it:

- **Every campaign on the server is `version: 0`.** Nobody has been handed a
  server version since migration 0004, so by v0.18.5's rule the first write from
  any device will be refused until it has pulled once. That is the intended
  behaviour and it will look like a failure the first time it happens.
- **The v0.19.1 starting-scrip fix owes the five players 11 scrip between them** —
  2, 0, 2, 3, 3 and 1. One of those is an arsenal with no models at all, which is
  offered the full 3 and will reconcile downward as soon as it is built; that is
  the delta behaving correctly rather than a bug.

Files: `.gitignore`, `backups/README.md`, `CLAUDE.md`, `docs/data-model-v3.md`
RESOLVED: step 2 of the v3 plan; `splitLegacyCampaign` is no longer unverified.
UNVERIFIED: restoring a backup to *remote* — proven against a scratch SQLite
database only, and doing it for real means dropping the live one first.
NEXT: the UI cutover on local storage with sync off, then the audit.

---

### Session 41 — v0.19.2
Date: 2026-09-03

**feat: the app runs on the v3 shape, and `campaignShape.js` is gone**

Step 3 of `docs/data-model-v3.md`. The arsenal is now a top-level document, the
campaign is the table it sits at, and every component reads the new shape. The
old module was deleted rather than deprecated — two shapes in circulation is the
thing this whole change exists to end.

#### ⚠ Sync is off, and that is the most important line in this entry

`SYNC_DISABLED = true` in `src/hooks/useSync.js`, gating `reconcile`, `mirror`
and `forget`.

The reason is specific rather than cautious. The local shelf is v3; the **server
still holds v2 documents**, and `useSync` only knows how to push campaigns. One
successful push would replace a player's server copy with a campaign that has no
arsenal in it — the leader, models, scrip and injuries now live in a separate
document that nothing sends — and their arsenal would by then be the only copy.
Another device pulling that finds a leader-shaped hole. That is the v0.18.4 class
of loss again, except with five other people's campaigns on the database.

Turning it back on is step 5 and is **not** deleting the constant: generalise
`knownVersion` / `markDirty` / `planSync` over a `kind` once, add `version` to
`arsenals` in 0005, teach the server both shapes. The shelf says the state out
loud in the meantime (`status: 'paused'`), because §12's rule is that the screen
tells the truth about where the data is.

#### The shape of the cutover

- **`src/lib/shelf.js`** is new: the seam between `storage.js` (which knows
  nothing about shapes) and `shape/` (which knows nothing about storage). It
  holds `createSeatedArsenal`, `readShelf`, `forgetSeated` and the lift.
- **`useCampaign` holds two documents**, with two `lastWritten` refs rather than
  one. The v0.18.4 identity guard is preserved on both — reading is not editing,
  and every read path seeds the ref, or merely opening the app writes the
  document back and claims authorship of a change nobody made.
- **Shelf entries are `{ arsenal, campaign }`.** `campaign` may be null: an
  arsenal outlives its table by design, so the card renders "Not at a table"
  rather than inventing a week.
- **A solo player gets a silent campaign of one.** `createSeatedArsenal` makes
  both halves together, so soloing and a table of five are one code path.
- **The export is a bundle now.** One leader exports as
  `{ campaigns: [...], arsenals: [...] }`, because an arsenal without its table
  imports as a leader with no weeks, no house rules and no game history — which
  is not the thing the player thought they were exporting. The crash rescue in
  `ErrorBoundary` does the same, and still reads both indexes straight out of
  localStorage with no hooks and no shape module, so nothing it depends on can
  be part of what just broke.

#### The lift, and its safety net

`liftLocalShelfToV3` runs on every load and is idempotent — `migrateCampaign`
passes a v3 document straight through and `isLegacyCampaign` skips anything
already split.

**The v3 campaign is written back to `campaign:<id>`, the same key the v2 one
occupied.** Keeping two keys would have put two shapes in circulation, so the
original is parked at `v2-backup:campaign:<id>` first — the precedent
`adoptLegacyCampaign` set, for the reason it set it: *if this goes wrong, the
only copy of somebody's twelve weeks should still be where it was.* The snapshot
is never overwritten, so a second run cannot park an already-migrated document as
though it were the original.

Written with `keepTimestamp`, so the lift does not claim to be a local edit. It
reshaped a document the account has never seen in this form; restamping would
tell the sync layer this device authored it.

#### Verified in the browser, not asserted

A v2 campaign of the exact shape production holds — 3 models, 1 injury, 1 piece
of kit, 4 scrip, 2 experience boxes, 1 advancement, 1 finished game — was seeded
and the app loaded:

- The lift produced `arsenal:ars_…` at `schemaVersion: 3` with **no `arsenals`
  array**, and `campaign:cmp_…` with a host participation and **no
  `localArsenalId`**. Both ids preserved. The v2 snapshot was intact.
- Every screen rendered on the new shape: the shelf (week 3, 22ss, 4 scrip), the
  arsenal view with the roster grouped by arrival week, the campaign view
  reading "1 games won" — which is `gamesWon(campaign, arsenal.id)`, the call
  that needed an explicit arsenal id in v3 — and the aftermath finding the
  historical game by `arsenalId`.
- **A week was played.** A hand-typed hire priced at 4 scrip (9ss less the
  first-of-week 5) took the balance 4 → 0, filed the model under week 3, cleared
  the mandatory-hire nag, and landed **on the arsenal document, not the
  campaign**. It survived a reload, and the re-run lift was a no-op.
- "Build a new leader" produced a second arsenal with its own table, seated as
  host, leaving the first untouched.

#### What is left of the old module

Nothing. `campaignShape.js` and its 84 tests are deleted; their coverage is
replaced by 113 tests across `shape/arsenal`, `shape/campaign`, `shape/migrate`
and the new `shelf.test.js`. 396 tests, build clean.

`shelf.test.js` is the one worth reading: it covers the lift against a realistic
v2 document, the snapshot, idempotence under repeated loads, the v0.1 leader
path, and that discarding a leader takes a solo table with it but leaves a
shared one standing.

#### Still to do, in order

1. **Play a real week on the new shape.** Worth stating precisely, because the
   first draft of this entry said "play a real week" and that was wrong: a real
   game *was* played on 2026-09-02 (Mads v Dalton), and it is where every feature
   request in Session 40's item 0b came from. It was played on **v2**, before the
   cutover. So what is untested is v3 in front of two people, not the app in
   front of two people.
2. **Migration 0005**, then generalise sync last.
3. **The audit**, which is overdue and whose trigger — the cutover — has now
   fired.

Files: `src/lib/shelf.js` + test, `src/hooks/useCampaign.js` (rewritten),
       `src/hooks/useSync.js`, `src/lib/storage.js`, `src/App.jsx`,
       `src/components/{Aftermath,ArsenalLibrary,ArsenalSheet,ErrorBoundary,WeekControl}.jsx`,
       `src/components/aftermath/*`, `src/components/steps/*`,
       **deleted** `src/lib/campaignShape.js` and its test
RESOLVED: step 3 of the v3 plan; `campaignShape.js` retired as the plan required.
UNVERIFIED: a real week at a real table; sync against the new shape (off on
purpose); the lift running on a device that is not this one.
NEXT: play a week, then migration 0005 and the generalised sync, then the audit.

---

### Session 42 — v0.19.3
Date: 2026-09-03

**fix: the service worker could cache a white screen, permanently**

Found by deploying. v0.19.2 went to production, the apex served a blank page,
and the console said a module script had arrived as `text/html`.

Production was fine — `curl` showed the apex serving the bundle correctly at
200 with `application/javascript`, and the deployment-specific URL rendered
v0.19.3's predecessor perfectly. The fault was in the browser, and inspecting
Cache Storage found it exactly:

```
hh-v1-assets → index-l4yJKYu6.js → content-type: text/html
```

#### The mechanism, which has been live since v0.14.0

Cloudflare Pages answers a missing path with `index.html` and a **200**. That is
correct for a navigation and poison for anything else. During the window in a
deploy where the new `index.html` is live but its content-hashed bundle has not
propagated to the edge, a browser asks for `/assets/index-abc123.js` and gets
HTML with a 200. The worker's rule was `if (res.ok && res.type === 'basic')`
— which that response satisfies — so it filed the HTML under the JS URL.

Cache-first then served it forever. The module fails its MIME check, nothing
renders, and **reloading cannot fix it**, because the cache is authoritative and
the navigation that would refresh `index.html` is not what is broken. A white
screen with no way out short of clearing site data.

`sw.js` is untouched by the v3 work; this bug predates all of it and every
deploy since v0.14.0 has rolled the dice. It is worth writing down that it was
found by *watching a deploy land* rather than by reading the code — the header
comment above the bug confidently explained why cache-first was safe here
("either content-hashed or immutable"), and that reasoning is right about URLs
and silent about status codes.

#### The fix

Two guards, because either alone leaves a hole:

- **Never write** an HTML body under a non-navigation request.
- **Never serve** one either — caches poisoned before this shipped are already
  on people's disks, and the read path has to defend itself.

`isHtml` reads the content type, because the status code says nothing here.

`VERSION` goes to `hh-v2`, and that is what actually rescues anyone already
broken: `activate` deletes every cache not in `KEEP`, so the poisoned entry goes
out with the old names.

#### `skipWaiting`, deliberately, this once

The worker had none, and the header explained why: a new worker should wait
rather than swap assets under a page that is mid-campaign. That reasoning holds
in general and fails exactly here — a poisoned browser renders nothing, so the
old worker keeps serving the poison through every reload and the fix never
activates. Nobody is mid-campaign on a blank page, and the assets are
content-hashed, so an early swap cannot mismatch them. The header now says all
of that rather than quietly contradicting itself.

Files: `public/sw.js`, `CLAUDE.md`, `package.json`
RESOLVED: a white screen that no reload could clear, live since v0.14.0.
UNVERIFIED: that the fix survives the *next* deploy's propagation window — which
is the only place the bug lives, and cannot be forced on demand.
NEXT: unchanged — play a week on v3, then migration 0005 and the generalised
sync, then the audit.

---

### Session 43 — v0.19.4
Date: 2026-09-03

**fix: the repair could not reach the browsers that needed it**

v0.19.3 fixed the service worker's cache poisoning and deployed cleanly. Then
the poisoned tab from the previous session was reloaded twice against the fixed
production build and **stayed blank**, still holding `hh-v1-assets`.

The fix was correct and undeliverable, which is a worse failure than the bug.

#### Why

`navigator.serviceWorker.register()` lived in `src/main.jsx` — inside the app
bundle. A poisoned cache stops that bundle from loading. So:

    poisoned cache → bundle does not load → register() never runs
    → browser never checks for a new worker → poisoned cache

A closed loop. The browser does check for worker updates on navigation, but it
is throttled and may consult the HTTP cache, so it is not something to rely on
for a page that is otherwise dead. Proved by hand: calling `reg.update()` from
the console purged `hh-v1-*` and left `hh-v2-shell` immediately. The fix worked
the moment anything asked for it. Nothing was asking.

The general form is worth keeping: **a repair that only runs when the app
already works cannot repair an app that does not.**

#### Two changes

**The worker is registered from `index.html`**, in an inline script that runs
whether or not the module bundle arrives, with `updateViaCache: 'none'` so the
browser fetches `/sw.js` from the network rather than its HTTP cache. `main.jsx`
keeps a comment saying where it went and not to move it back.

**A one-shot boot recovery**, also inline. `ErrorBoundary` catches a render that
throws, which quietly assumes React started; nothing covered the bundle never
arriving. Five seconds after load, if `#root` is still empty, it clears Cache
Storage, unregisters every worker and reloads — **once**, guarded by
sessionStorage, because a reload loop against a genuinely broken deploy would be
worse than the white screen it is curing. One attempt, then it stops and lets
the problem be seen.

That second one is deliberately general. It does not know about service workers
or MIME types; it knows the app did not start, and tries the two things that
most often explain that. The specific bug is fixed in `sw.js`; this is the net
under the next one.

Files: `index.html`, `src/main.jsx`, `CLAUDE.md`, `package.json`
RESOLVED: the delivery gap — the v0.19.3 fix can now reach a poisoned browser.
UNVERIFIED: the recovery script firing in production against a genuinely
poisoned cache. It was reasoned from a reproduction, not triggered on a stranger's
device, and by its nature the situation cannot be manufactured on demand.
NEXT: unchanged — play a week on v3, then migration 0005 and the generalised
sync, then the audit.

---

### Session 44 — v0.20.0
Date: 2026-09-03

**feat: a conflict is a question with two answers, and now it asks**

Built ahead of the migrations, which is what `docs/sync-v3-plan.md` argued for:
an arsenal changes every week, so it will conflict far more often than a
campaign ever did, and the honest failure — *these disagree, a person must
choose* — had nowhere to appear.

#### The advice it replaces could not be followed

`planSync` has reported conflicts correctly since v0.18.5. `useSync` turned each
one into a sentence:

> "…Nothing was overwritten; open it on one device and save to settle it."

Saving cannot settle it. A conflict means `isDirty` is already true and
`knownVersion` already differs from the server's, and saving again changes
neither — so the next reconcile reports the same conflict, every push is refused
with a 409, and the dirty flag is only ever cleared by a successful push, which
is the one thing that cannot happen. The app was telling people, indefinitely, to
do the single action that could not work. Nothing was lost — both copies stay
intact, which is the design working — but there was no way out except two
undocumented ones: discard the local copy, or export and re-import.

#### Whose conflict it is

Worth stating because it makes the whole feature smaller than it sounds. A
conflict is **always between one person's own two devices**, never between two
players: `useSync` only reconciles documents where `belongsTo(doc, user.id)`, and
`campaignStore` refuses any write where `owner_user_id !== userId`. Madeline
cannot edit your arsenal — membership is a read-only pointer and writes were
never widened. So it is not a merge negotiation, it is "you did something on two
devices; which did you mean?", and the only person with anything at stake is the
one being asked.

#### What it shows

`src/lib/shape/compare.js` — pure, 17 tests. It turns two documents into the
numbers a player recognises (scrip, models, arsenal total, injuries, experience,
advancements) and, the half that actually settles it, **what each side has that
the other does not**: *"yours has Nekima hired in week 3; theirs has a broken arm
on the Terror Tot."* That is a five-second decision. "Version 4 versus version 7"
is a coin toss.

`canonical()` sorts keys so a server round trip is not mistaken for an edit, and
drops `updatedAt` at the top level only — nested, it is somebody's data rather
than a save clock.

#### Three rules in the screen worth not undoing

- **It never interrupts.** No modal, no redirect. The conflicted state is safe,
  so it sits on the shelf until its owner wants it. Being asked which copy of
  your leader is real, three phases into an aftermath at a table, is the app
  picking the worst possible moment for a question that could have waited.
- **"Keep both" is the recommendation**, because it is the only answer that
  cannot be wrong: the local copy forks to a new id and stays on the shelf, so
  the choice becomes reversible and the loser can be discarded next week. It uses
  `forkDocument`, **not** `duplicateArsenal` — that one deliberately drops scrip,
  injuries and experience because it answers a different question ("same leader,
  new table"). A conflict fork is verbatim; both sides are real histories.
  Offered for arsenals only: a forked campaign leaves its participations pointing
  at the original table, turning one conflict into several.
- **Identical copies settle themselves.** `sameInSubstance` catches two devices
  that made the same edit, or a dirty flag from a save that changed nothing.
  Provably lossless, so asking would be diligence performed rather than
  exercised. It is the *only* automatic resolution, and it is deliberately strict
  — a reordered array reads as different, which errs toward asking. Being asked
  needlessly costs a click; auto-resolving wrongly costs an evening.

#### The version bookkeeping, which is the easy thing to get wrong

"Keep mine" has to satisfy `baseVersion`, and the tempting fix is a `force` flag
on the server. It records the server's current version as the one this device has
**seen** instead, and pushes normally.

That is not a bypass. The gate asks *"have you seen the copy you are
replacing?"*, and on this screen the answer is genuinely yes — a person was shown
it and chose. A `force` flag answers a different question, and that is the one
that destroyed a leader portrait twice.

#### Verified

421 tests. The pure layer is fully covered; the screen was driven in a browser
against an injected conflict — both columns, the difference table, the mobile
stack at 375px with no horizontal overflow, and a click confirmed to reach
`resolve` with the right choice. The temporary probe used to inject it was
removed and its absence asserted before commit.

**Not verified, and it cannot be yet:** an actual conflict. Sync is off, so no
two devices can currently disagree. This ships ready for step F rather than
proven by it.

Files: `src/lib/shape/compare.js` + test, `src/lib/shelf.js` (+`resolveConflict`,
       `forkDocument`, `conflictExport`) + tests, `src/hooks/useSync.js`,
       `src/components/ConflictNotice.jsx`, `src/components/ArsenalLibrary.jsx`,
       `src/styles/app.css`, `docs/sync-v3-plan.md`, `CLAUDE.md`
RESOLVED: the last open Known Issue, and an on-screen instruction that could
never have worked.
UNVERIFIED: everything about it under a real conflict.
NEXT: unchanged — play a week on v3, then migrations 0005/0006 and the
generalised sync, then the audit.

---

### Session 45 — v0.20.1
Date: 2026-09-03

**feat: pulling works again — step E, and the guard that makes it safe**

Migrations 0005 and 0006 went in earlier the same day (see below). This is the
client half: `SYNC_DISABLED` becomes `PUSH_DISABLED`, `reconcile` runs and pulls,
and `mirror`/`forget`/the push loop stay refused.

A second device, or a cleared browser, gets the account's leaders back. New work
still does not go up — that is step F — and the shelf says so in those words
rather than claiming to be synced.

#### The bug this step would have shipped

Pull-only sounds safe and is not, and the reasoning is worth keeping because it
is the fourth time this project has met the same shape.

The server holds **v2** documents, so pulling one means *lifting* it, and lifting
writes an `arsenal:<id>`. That is where a week of play lives. But `planSync`
decides pull-versus-push from the **campaign's** dirty flag, and a device that
played a week has a *clean campaign and a changed arsenal* — because
`saveArsenal` deliberately did not mark anything dirty, on the reasoning that
arsenals did not sync so the flag had nothing to protect.

So: clean campaign, server ahead → pull → lift → **the week is gone.**

`planSync` was not wrong. It was never told the arsenal existed. Same shape as
v0.18.4, and as the `baseVersion` overclaim corrected earlier today: **a guard
phrased about one document and enforced against another will pass every time.**

#### `planPull`, and the clause that matters

`saveArsenal` now marks dirty, and `planPull` decides per arsenal, by content:

- no local copy, or identical in substance, or **known** clean → write it;
- differs and the local copy is dirty **or unknown** → conflict.

And if any arsenal in a document conflicts, **nothing from that document is
written, not even the campaign** — the two came out of one document and are one
decision; taking half would leave a table whose players disagree with it.

The "or unknown" is the load-bearing half. `isDirty` returns `null` for anything
nobody has flagged, and until this session *nothing* flagged an arsenal — so
every arsenal edited between the v3 cutover and now reads as unknown. Treating
unknown as clean would have thrown away precisely the work this step exists to
protect.

No version is recorded against a pulled arsenal, because there is nothing to
record: every `arsenals.doc` on the server is still NULL. Step F gives them their
own.

#### Proven end to end, not asserted

Against a local D1 restored from the real backup and migrated, with a forged
session for the owner:

- An **empty browser** signed in and pulled: "1 pulled down", *Cletus and Duke
  Carcinus*, Neverborn · Schemer, 5 models, 25ss, 3 scrip. Storage held an
  arsenal and a campaign as separate documents, both at schemaVersion 3, the
  campaign with a participation and no `arsenals` array, and **no `version` on
  either doc** — `stripSyncFields` doing its job, since version on a doc would be
  wiped by the next keystroke and would ride into the JSON export meaning nothing.
- Then a week was played on that device and the base put behind the server. The
  reconcile **left the week alone** — 6 models, 0 scrip, Nekima still there — and
  raised a conflict showing *this device: Nekima (week 3), 6 models, 38ss* against
  *your account: 5 models, 25ss*.

#### One thing the real data exposed

Both sides of that conflict first read **"no save time recorded"**. A v2 nested
arsenal has no `updatedAt` of its own — it was part of the campaign, so the
campaign's was the only clock. A lifted arsenal now inherits it, which is the
honest answer to "when was this last touched?" and restores the single most
orienting fact on the one screen where somebody is choosing between two copies of
their campaign.

431 tests.

Files: `src/lib/storage.js`, `src/lib/shelf.js` (+`planPull`, `stripSyncFields`)
       + tests, `src/lib/shape/migrate.js` + tests, `src/hooks/useSync.js`,
       `src/components/ArsenalLibrary.jsx`, `CLAUDE.md`, `docs/sync-v3-plan.md`
RESOLVED: step E; the pull-clobbers-a-week hazard, before it could ship.
UNVERIFIED: any of this against the *live* server — proven against a local D1
restored from the real backup, which is the same data and the same engine, but
not the same machine.
NEXT: step F — `arsenalStore.js`, the arsenal routes, `putCampaign` taught the v3
shape, and `planSync` called once per kind. Then the audit.

---

### Session 46 — v0.20.2
Date: 2026-09-03

**fix: the host was told nobody had been invited, for three versions**

Reported from production: a campaign with an admitted member showed *"This
campaign is yours alone. Nobody has been invited to it, and nothing about it is
visible to anyone else."*

Nothing was lost. `campaign_members` held the row all along — Madeline
(`Arginix`), status `active`, on `cmp_msz7vwn65g62vf` — and the endpoint returned
`viewerRole: "owner"` correctly when asked the right question.

#### The bug

`App.jsx` passed `openId` to `useMembership` as `campaignId`. **`openId` has
named the open *arsenal* since the v3 cutover (v0.19.2)**, when the thing a
player opens stopped being a campaign. So every membership lookup asked the
server about an arsenal id, `roleIn` found no campaign row, `canRead(null)`
refused, and the client's catch turned that into `viewerRole: null` — which the
Players screen renders as "yours alone".

Mine, introduced in the cutover. The sweep that moved components onto the new
shape checked every use of `shelf` and never asked what `openId` now meant. **A
rename that changes what a variable means is not a rename**, and a variable whose
meaning changed while its name did not is invisible to grep.

It hid for three versions because the failure is silent by design: a 404 from
this endpoint is the ordinary state of a solo campaign, so `useMembership`
deliberately sets `error` to null for one. Correct for the case it was written
for, and it swallowed a real fault.

#### The second half, which is now a real state

With pushes off, a campaign built on this device genuinely is not on the server,
and "nobody has been invited" is misleading there too. `useMembership` now
reports `knownToServer`, and the Players screen says *"This campaign has not
reached your account yet"* for a 404, keeping "yours alone" for a campaign the
account does know and nobody has joined.

#### What this also proved about membership

Investigating it demonstrated the gap the v3 rewire exists to close. Madeline is
an **active member**, and her arsenal still cannot appear, because the shared
read is `WHERE id = ? OR member_of = ?` and `member_of` is NULL on every campaign
in the database. Being admitted and having your arsenal visible are two separate
steps and only the first ever happened. Proven on a restore: with `member_of`
NULL the shared view returns one arsenal, and setting it returns two.

`campaign_members.arsenal_id` (0005) removes that second step, and it is also the
answer to "which of my leaders am I bringing?". Step F should rewire the shared
read to it and stop consulting `member_of`. Recorded in `docs/sync-v3-plan.md`.

Verified against a local D1 restored from the real backup with a forged session:
the Players screen now shows the redeemed invite ("Madeline · used by Arginix"),
the member row, and the host's own arsenal.

431 tests.

Files: `src/App.jsx`, `src/hooks/useMembership.js`,
       `src/components/steps/Players.jsx`, `CLAUDE.md`, `docs/sync-v3-plan.md`
RESOLVED: membership invisible since v0.19.2.
UNVERIFIED: that her *arsenal* appears — it cannot until `member_of` or
`arsenal_id` is wired, which is step F.
NEXT: step F.
