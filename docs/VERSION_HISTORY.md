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
