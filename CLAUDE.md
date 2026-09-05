# CLAUDE.md — Hodgepodge Hearthside project context

<!-- HH v0.22.1 | Last updated: 2026-09-05 -->

---

## Current Version: 0.22.1

## Last Updated: 2026-09-05

**Live at hodgepodgehearthside.com** (Cloudflare Pages, auto-deploys on push to
`main`). Repo: `ZariasKobold/hodgepodge-hearthside`.

*Filename is `CLAUDE.md` rather than `HH_CONTEXT.md` deliberately — Claude Code
loads it automatically, so the "read the context doc first" step can't be
skipped by forgetting.*

---

## 📋 SESSION RULES — follow these whenever files are ready to hand off

### 1. File handoff tree

Whenever files are produced or modified and ready to deploy, output a tree of
every file created or modified, labelled `← replace` or `← new`. This may
happen mid-session or at the end — produce it whenever a deployable set is
complete.

Only files actually touched this session. Never list unchanged files.

```
hodgepodge-hearthside/
├── src/
│   ├── data/hank.js                    ← replace
│   └── hooks/useCampaign.js            ← new
└── docs/hank-dialogue.md               ← replace
```

### 2. Git commit block

After the tree, always output the exact commands:

```bash
git add .
git commit -m "feat: description of what changed"
git push
```

Cloudflare Pages redeploys on push to `main`. Branches get preview URLs.

### 3. Update this file and the version history

At the end of every session:
- Bump the version on line 3 and in `## Current Version`
- Update `## Last Updated`
- Clear anything now done from `## ⚠️ NEXT SESSION`
- Add an entry to `docs/VERSION_HISTORY.md` — that's where "why was it done
  this way" lives, and it's the file a future session diffs against

### 4. Verify before handing off

```bash
npm run test && npm run build
```

Both must pass. Tests are not decoration here — the campaign arithmetic is the
part people will argue about at a table, and a wrong scrip total is worse than
a crash because nobody notices it.

### 5. Audit cadence

Feature sessions ship features and miss cross-file drift. Audit whenever any
of these fire:

- Every 10 sessions, counted from the numbered entries in `docs/VERSION_HISTORY.md`.
  The Session 20 audit was missed and finally ran at Session 29; four of that
  audit's findings were introduced during the nine sessions it was late, which is
  the argument for treating "audit due" as blocking rather than as a queue item.
  Sessions are counted rather than version numbers because a minor bump skips a
  patch series and makes a version-based target unreachable — which is exactly
  what happened to the old v0.3.10 target.

  **It has happened again. The Session 39 audit is overdue.** Sessions 39, 39b,
  39c, 39d, 39e and 39f all shipped without it, and this is Session 40. The
  lettered-suffix habit is how it got missed: six sessions all called "39" look
  like one session, and the counter that decides when an audit is due stops
  counting. Number sessions plainly — 40, 41, 42 — and let the version carry the
  patch series. See `## ⚠️ NEXT SESSION` for when to run it.
- Before any milestone that widens blast radius: first D1 write, first
  non-you user, submitting to Wyrd's Community Creators page
- **A new top-level module, a change under `functions/`, or the first write of a
  shape that persists.** Rewritten at Session 40, as the previous entry demanded.
  It used to read "8+ files or a shared module", which fired at Sessions 34, 35
  and 37 and was ignored every time because nearly every feature session touches
  eight files. A trigger that fires always and is obeyed never devalues the two
  above it. This wording fires rarely and means something when it does — Session
  40 tripped it (`src/lib/shape/`), and the audit it points at is the one already
  overdue above.

Ritual: read this file and `docs/VERSION_HISTORY.md` in full, then every file
in `src/`, then catalogue findings by priority **before** writing fix code.
Save to `docs/audits/audit-vX.Y.Z.md`.

**Dialogue-specific audit:** confirm `src/data/hank.js` and
`docs/hank-dialogue.md` still agree. They drift silently and nothing catches it.

---

## ⚠️ NEXT SESSION — pending

### Where things stand — v0.21.1

Sessions 14–38 took this from a local-only leader builder to a synced,
multi-leader campaign tracker that plays a whole campaign week, game and
aftermath. Shipped and live:

| | |
|---|---|
| **Rules text** | Fetched live from BiggerHat and shown on the record, on loadout hovers, and on crew cards. Never persisted (§4). |
| **Exports** | JSON, PNG (canvas), PDF (print stylesheet). Wyrd's disclaimer rides on all three. |
| **Versatile hiring** | The declared faction's Versatile models are hirable, grouped apart in both pickers. Verified against the register at v0.16.0: all 14 Neverborn Versatile models show, which is correct — Versatile means hirable regardless of keyword. A Versatile model that also shares your keyword stays in the Versatile group by owner decision: the heading names what a model *is*, not why you happen to be allowed it. |
| **Totems** | Their own category, never a hire. `isSelectionSource` excludes them by name, the Arsenal view gives them a section outside the week groups, and they count toward neither the arsenal total nor the encounter cap. The only route to one is the tier-3 advancement table. |
| **The shelf** | Many leaders, one campaign each. Import files a new one; nothing is overwritten. |
| **Arsenal view** | Leader record, ledger, roster grouped by the week each model arrived, crew cards. |
| **Arsenal sheet** | Every field of the official sheet, in this app's own type and palette. |
| **D1 sync** | Local-first, D1 mirrors. Signing in adopts anything built signed out. **Confirmed working across the owner's phone and computer.** |
| **Security** | Ownership gate, `requireSubject`, same-origin writes, 16 authorization tests, account erasure. |
| **The look** | v0.11.0. A camp at dusk. Owner-drawn hero across the masthead, pinned and shrinking on scroll; a 1024px reading column; a bottom navbar on phones. One firelight source, Rye on the wordmark, Alegreya everywhere else. The page behind the column is deliberately plain — a background of props was built and removed by owner decision. |
| **Hank has a face** | v0.9.1. Owner-drawn 16-bit medallion, served as a 33 KB WebP beside every line he speaks. See `docs/ART_BRIEF.md`. |
| **The aftermath** | v0.16.0. All six phases as one stateful flow, walked once per game, the record stored on the game so it survives a closed tab and syncs like anything else. Barter with the full equipment table, leader advancement across all six tables, Dr. Mo, injury flips with their reflip conditions, and annihilation checked at the end of phase 6. |
| **The week is yours** | v0.17.0. Calendar or manual, per campaign. Forward *and back* in both. Campaign length, week length and start date are all editable. Calendar mode still writes an offset, not a week, so it keeps advancing underneath. |
| **The build stamp** | v0.18.0. Version, commit and build date in the footer, baked in by `vite.config.js`. The commit is the half that matters — `CF_PAGES_COMMIT_SHA` cannot be forgotten the way a version bump can, and it answers "is what I pushed what is live?" from the page itself. |
| **The v3 shape** | v0.19.2. Arsenals are top-level objects and campaigns are tables. **The app runs on this now** — `campaignShape.js` is deleted. The lift runs on load and was verified against all six live campaigns. ⚠ **Sync is off** while it beds in; see below. |
| **The starting scrip** | v0.19.1. p. 15's grant is finally *paid* rather than only displayed. Reconciled from the week-0 models, so editing the starting arsenal adjusts the balance instead of paying twice; arsenals that predate the fix are **offered** the scrip they were never given. |
| **Sync is back on** | v0.21.0. Both kinds. `arsenalStore.js` + `/api/arsenals` beside the campaign pair, a shape gate on both, and `planSync` called once per kind rather than rewritten. Round trip proven: pull → play a week → push → a second device sees the hire. |
| **Membership is visible again** | v0.20.2. `openId` names the open *arsenal* since the v3 cutover, and `App` was still handing it to `useMembership` as a campaign id — so every membership lookup asked about an arsenal, found no campaign, and was refused. A host with an admitted member was told "This campaign is yours alone" for three versions. **A rename that changes what a variable means is not a rename.** |
| **Pulling works again** | v0.20.1. A second device, or a cleared browser, gets the account's leaders back — the v2 document is pulled and lifted locally. Pushing stays off until step F. `planPull` refuses to overwrite an arsenal this device has changed, and raises a conflict instead. |
| **Conflicts have a screen** | v0.20.0. Two copies side by side in the player's own terms — scrip, models, injuries, and what each side has the other lacks — with keep mine / take theirs / **keep both**. Never a modal: the conflicted state is safe, so it waits on the shelf. Identical copies settle themselves. Unexercised against a real conflict until sync returns. |
| **Booting is defended** | v0.19.4. The worker is registered from `index.html`, not from the bundle — a registration living inside the bundle cannot repair a browser that cannot load the bundle, which is what made the v0.19.3 bug unrecoverable. Plus a one-shot recovery: an empty `#root` after five seconds clears caches, unregisters workers and reloads once, guarded by sessionStorage so it can never loop. |
| **The service worker** | v0.19.3. It cached Pages' SPA fallback under asset URLs, so a browser that loaded mid-deploy got a **permanent white screen** no reload could clear. Live since v0.14.0, observed in production on 2026-09-03. Two guards now — never write HTML under a non-navigation request, never serve it either — plus a cache-version bump that purges anyone already poisoned. |
| **Membership** | v0.17.0. Owner-issued single-use invites, two gates (redeem → pending → host admits), per-campaign nicknames, opt-in Discord identity, and a read-only shared arsenal page. Writes were **not** widened — see below. |

503 tests.

### The book is on disk, and must not be committed

`docs/Index_of_the_Untold.pdf` is the campaign book. It is the source for
`src/data/equipment.js`, `injuries.js` and `advancements.js`, and it is worth
keeping to hand — several of this project's older mistakes came from working
from memory of the rules rather than from the rules.

**`docs/*.pdf` is in `.gitignore` and must stay there.** This repository is
public. The book's own copyright page permits personal non-commercial copies
and explicitly bars distributing them, so committing it would be redistributing
Wyrd's product — the fastest available way to lose the fan-site permission this
whole project depends on (§8). The session rules' `git add .` would have swept
it in.

### Sync is back on, both kinds — v0.21.0

Step F of `docs/sync-v3-plan.md`. `PUSH_DISABLED` is **false**; arsenals and
campaigns each have their own endpoint, their own server-assigned version, and
are planned by the same `planSync` called once per kind.

**Keep the constant.** Flipping it back is a one-line, one-deploy stop if the
two-kind sync turns out to be wrong on a real device, and that is worth more
than the tidiness of deleting it.

What went in, and the rules that must not be undone:

- **`functions/lib/arsenalStore.js`** + `/api/arsenals`, written to
  `campaignStore.js`'s three rules — `userId` first, `requireSubject` throws,
  and **one ownership gate before any write**. 25 attack tests.
- **A shape gate on both stores.** Any write whose `schemaVersion` is lower than
  the row's is refused with a 409. The version gate cannot catch this: a stale
  tab that has pulled holds a perfectly valid base version.
- **`putCampaign` no longer assumes `campaign.arsenals[0]`**, and the campaigns
  route no longer *requires* it — that check would have rejected every v3
  campaign. A validity rule written against the shape of the day outlives the day.
- **Ordering is load-bearing**: push campaigns before arsenals and pull them
  first too, because `arsenals.campaign_id` references `campaigns(id)` and D1
  enforces foreign keys.
- **`planSync` was parameterised, not rewritten.** It is called once per kind.
  Teaching the one function that can lose twelve weeks to understand two kinds
  would have been the expensive way to avoid calling it twice.

**A projection-only row is a first write, not a conflict.** A v2 campaign push
wrote the `arsenals` columns with no document, so those rows carry `version 0`
and `doc NULL`. Treating them as existing documents deadlocked the first push:
the gate wanted `baseVersion === 0` while `listArsenals` hides `doc IS NULL`
rows, so the client could not push without a version it could not be told.
Neither half was wrong alone. Only a database with real v2 history has such
rows — a fresh one never would, which is why this was found by restoring the
backup rather than by testing an empty schema.

Proven end to end against a local D1 restored from the real backup: an empty
browser pulled and lifted, a week was played, the hire reached the server as a
v3 arsenal document (version 1, `schemaVersion` 3), and a **second empty browser
pulled it back** with the hire intact.

**v0.21.1 — the loop that was missing.** `reconcile` had no arsenal *push* loop:
an edit script's string replace had failed to match and said nothing. The
end-to-end test passed anyway, because `mirrorArsenal` pushes on every save and
the test made a save — so the only broken case was the one the test did not
cover, **an arsenal already dirty before the app opened**. That is adoption, and
it is the state the sync pause left every device in. Caught by looking at
production and finding no arsenal documents there.

Two lessons worth keeping: **assert that an edit matched**, and a green test
suite says nothing about a path no test walks.

**Adoption is confirmed on production — 2026-09-04.** The owner opened v0.21.1
on a signed-in phone and `ars_msz7vwn6x9k64r` came up `schema_version 3`,
`version 1`, `doc` written, scrip 3, still seated at its campaign. That is the
exact path the missing loop broke, checked where it actually matters rather than
in a test. The other five arsenals remain `schema_version 0` with no `doc` —
**that is correct**, not a failure: they are the projection-only rows a v2
campaign push left behind, and each adopts when its own owner next opens the app.

### Membership works; the link nobody has clicked does not

Also settled on 2026-09-04, by reading remote rather than reasoning about it.
The host's Players tab says **"1 in the campaign"** while correctly listing an
admitted member, and both halves of that are right.

`campaign_members` holds a real `active` row — so v0.20.2's fix holds — but every
`campaigns.member_of` on production is `NULL`, and `listSharedArsenals` gathers
the group with `WHERE id = ? OR member_of = ?`. No pointer, no arsenal in the
group. The pointer is set by `BringALeader` in `steps/Players.jsx`, on the
**member's** device, and it is explicit by design: linking is what puts your
arsenal in front of other people, so it should be a thing you did rather than a
thing that happened. **A member who has been admitted has not yet arrived.**

Two things follow. The screen never says this — an admitted member appears in
the host's list while being invisible in Everyone's arsenal, and nothing explains
the gap to either of them. And `campaign_members.arsenal_id`, added in 0005, is
still `NULL` everywhere because nothing writes it; wiring it is what lets a
member bring an arsenal without needing a campaign row of their own to point,
which is the membership rewire still outstanding below.

### ✅ The audit has run — `docs/audits/audit-v0.21.1.md`

Session 40, after the v3 cutover as planned. **Number sessions plainly from
here — 41, 42, 43.** §5's third trigger (a new top-level module) is what finally
fired it, and that is worth keeping: the two triggers that fire on ordinary
feature sessions were ignored every time, and the one that fires rarely was
obeyed at once. Keep §5's list short and its wording narrow.

**The transcription is correct.** All three data files were read against the
book — 82 barter rows (name, rating, campaign cost, suit), 9 relics, 28 injury
rows, all 6 reflip conditions, 14 Lucky Miss, 7 doctor rows, the table sizes
60/63/74/30/15/7 and all 7 flip semantics. Every value matches. That closes the
standing "needs the book open beside the file" risk **for these files as they
stand** — it does not close it for anything transcribed later.

`EXPERIENCE_TRACK` is verified too, and the method is worth reusing: character
columns from `pdftotext -layout` are not good enough for a graphical grid, but
real glyph coordinates are. Ten of the fifteen numbers resolve to exact columns
at 35.37pt spacing across 13 columns and all ten match; p.37's worked example
independently pins the first three boxes as 1, 1, 2 and confirms 13 boxes per
row, so 39 in total.

**`Aftermath.jsx` is idempotent**, and the warning that used to sit here — that
barter, the doctor and the injury flips "all append and would double on a
revisit" — was **wrong by the time it was read**. Every phase derives its
remaining work from the record rather than trusting a flag, which is the
stronger guarantee: `pending` excludes subjects already flipped, bought items
are disabled, and boxes already taken are excluded. There is no way back either
— the phase rail is inert spans and `done: true` removes the game from `open`.
One ordering defect survives, and it is finding M1.

The findings, in priority order: ~~**H1**~~ and ~~**M1**~~ are **fixed in
v0.22.0**; ~~**M2**~~ was closed by correcting this file. Still open: **M3** the
`corrupt` flag is computed and silently discarded; **L1** the OAuth state cookie
is never cleared; **L2** the dialogue checker still is not committed; **L3**
`AFTERMATH_INJURED[0]`'s timing.

### The aftermath goes backwards now — v0.22.0

Item 0b's fourth bullet, and it arrived by the route that item asked for: **the
record is the provenance.** Every arsenal effect the aftermath applies is already
named in the record — `bought` names the equipment, `attempts` the injuries
healed, `flips` the injuries attached, `taken` the advancements — so nothing
needed tagging and rewinding is replaying the record backwards. That is
`src/lib/rewind.js`, pure and 27 tests.

Four rules in it that should not be undone:

- **Later phases unwind before earlier ones.** Payday funds the barter and the
  doctor. Reverse the payday first and the balance floors at zero, silently
  eating the refund that was about to arrive. `unwindArsenal` sorts into reverse
  phase order itself, so a caller cannot get this wrong.
- **A revision undoes the phase it is revising, not just what follows.** Found
  in the browser, not in a test: unlocking Payday while its scrip was still in
  the purse gave a screen reading "Already collected" with no way to change the
  figure — a read-only view wearing an edit button.
- **The warning names the actual things.** "Coffee — bought, 2 scrip back", not
  "3 items". A count is not something a player can answer "are you sure?" to.
- **A reachable phase has to look like a control.** The first cut made walked
  phases into bare buttons with no border and only a hover colour, which is
  indistinguishable from the inert spans beside them — "I see the rail but no
  way to click on it" was the report. They now carry a border and a dotted
  underline. Being clickable and looking clickable are two separate features,
  and only the first one has a test.
- **`furthest` is derived, never merely stored** (`furthestReached`). v0.22.0
  shipped it as a stored value falling back to the *current* phase, so stepping
  backwards redefined how far the player had come: the forward button vanished
  and the walk became a one-way trip into its own past. Found in production
  within the hour. It is now the maximum of the stamp, where the player is
  standing, and **the furthest phase with anything recorded in it** — the last
  of which is what repairs a record the bug already damaged, with no migration.
- **A phase behind the furthest point is settled, `locked` or not.** Every
  phase's action button is *also* what advances the walk, so landing on a
  walked-past phase with its action already spent — Payday reading "Already
  collected", disabled — leaves no way onward from inside it. That was the
  second half of the same production report.
- **Reversal only works because nothing was ever destroyed.** `healInjury`
  writes `removedAt` and `annihilateModel` writes a flag, both chosen so the
  campaign's story stayed legible. That readability decision is what made this
  feature possible at all.

Purchases and injury flips now record the **row id** they created, so an undo
removes the row it made rather than one that merely looks like it; and the
advance phase records `boxesApplied`, because once the boxes are checked
`boxesCrossed` reads a different track and would name a different set.

### `reconcile` is testable, and testing it found a live bug — v0.22.0

H1's fix. The orchestration moved out of `useSync` into `src/lib/reconcile.js`
as `runReconcile`, a plain function with storage and the network injected —
§6's rule, applied to the one place it had never reached. 18 tests, and the
first one fails against the v0.21.1 code.

**Writing them found something.** `stripSyncFields` was applied only on the
campaign pull path, so every pulled arsenal carried the server's `version` into
localStorage — against the rule in that function's own comment. Worse, the
identical-copies auto-settle compared raw documents, and a conflict *by
definition* means the server's version has moved away from this device's base.
So `sameInSubstance` returned false every single time and **the one case the app
is allowed to settle by itself could never fire, for either kind.** Both halves
are fixed and both are pinned by tests.

The lesson is the one v0.21.1 wrote down and did not act on: a green suite says
nothing about a path no test walks. `planSync` had 29 tests and was never the
problem; the loops around it had none.

### Audits

`docs/audits/audit-v0.21.1.md` is the current one (Session 40); its findings
are listed above and none is closed yet.

`docs/audits/audit-v0.11.0.md` is the second (Session 29), and it carries a
status block. **Every finding is closed** — both print findings, all
three highs, all five mediums and all fourteen lows, across v0.12.0 and
v0.13.0. Two lows (L6, L13) are closed as *documented rather than changed*,
with the reasoning written into the code.

The one worth carrying in your head: **the shelf is scoped by account, not by
browser.** Campaigns carry `ownerUserId`, and `belongsTo` decides what a signed‑in
user may see. An unclaimed campaign is visible to anyone — that is the adoption
path §12 describes — but a claimed one is visible only to its owner, and
signing out hides rather than deletes, because deleting would throw away work
that may not have finished syncing.

`docs/audits/audit-v0.5.2.md` is the first one. **H1, M1, M2, M3, M4, M5, M7
and L8 are done.** M6 was **retracted** — a measurement error, not drift.
**M8 is closed** — `isSelectionSource` excludes totems by name (`!isTotem`)
and has since v0.16.0. This file asserted the opposite for several versions
while its own feature table said otherwise; settled by reading the code at the
v0.21.1 audit. **L2 is closed too** — `loadLocalRegister` is wired and
`useRoster` calls it. The other nine lows are still open.

Two things from that work worth keeping:

- **The dialogue check needs a real counter.** M6's false positive came from a
  regex that assumed every code looks like `S-04`. The doc uses three formats
  (`XX-NN`, `XX-WORD`, `XX-FNN`) plus descriptive suffixes on `C-01 · Identity`.
  A naive pattern silently drops fourteen entries and "finds" drift that is not
  there. The counter script is still unwritten.
- **`createCampaign` spreads its patch last.** Passing `id: undefined` to blank
  a field overwrites the value it just generated, and `saveCampaign` then
  no-ops on the missing id. Strip keys, do not blank them.

### Migrations 0005 and 0006 are applied on remote — verified 2026-09-03

Both run, both verified against the live database rather than assumed. Counts
identical before and after, no orphans, no leftover tables, all six campaign
documents byte-for-byte unchanged. **`arsenals.campaign_id` is now nullable and
`ON DELETE SET NULL`**, proven on remote with a throwaway campaign whose arsenal
survived its deletion.

Two things learned doing it, both worth keeping:

- **D1 enforces foreign keys.** So the old `ON DELETE CASCADE` really would have
  deleted a player's leader with their campaign; it was not theoretical.
- **`d1 execute --file` is atomic.** A file whose last statement fails rolls the
  whole thing back, so a half-applied migration is not a state that can happen.

**⚠ Never run `wrangler d1 migrations apply`.** There is no `d1_migrations`
table — every migration here was applied with `d1 execute --file` — so wrangler
believes none have run and would replay 0001–0006 against live data.

### Migration 0003 is applied on remote — verified 2026-09-01

This section stood as ⚠ BLOCKING for several versions and was already false.
Checked directly rather than believed: `campaign_invites` exists, and so do
`campaigns.member_of` and `campaign_members.status / nickname /
share_identity`. The membership endpoints are not 500ing in production.

**The remote database is no longer just yours.** Five users, six campaigns,
five distinct owners. Someone redeemed an invite and is an `active` member of
the owner's own campaign. That means §5's "first non-you user" audit trigger —
listed there as a thing to do *before* the milestone — has already fired,
unnoticed, and the Session 39 audit inherits it.

Two consequences worth holding on to:

- Every mistake now costs somebody else's evening as well as your own.
- `DELETE /api/account` and any hand-run SQL against remote are no longer
  operating on a database where the only victim is you. Scope every statement
  by `owner_user_id`, not just by `id`.

### Setup is otherwise complete as of 2026-08-18.

D1 exists, the schema is applied, sign-in works end to end, and a real account
and session are in the remote database. Feature work is unblocked.

Two facts from that setup worth keeping, because both cost time to learn:

- **`/api/auth/me` is NOT a checkpoint for the D1 binding.** It was listed as
  one until v0.4.2 and cannot work: `currentUser` short-circuits on
  `if (!sessionId || !env.DB) return null`, so with no session cookie it
  returns `{"user":null}` whether the binding exists or not. Prove the binding
  with a query that touches D1:
  `npx wrangler d1 execute hodgepodge-hearthside --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`
  (ten tables, plus Cloudflare's internal `_cf_KV`).
- **`wrangler.toml` is the only place plaintext config can live.** Once a Pages
  project has one, the dashboard manages *secrets only* and refuses plain
  variables outright. The D1 binding and `DISCORD_CLIENT_ID` live in
  `wrangler.toml`; `DISCORD_CLIENT_SECRET` lives in the dashboard, encrypted.

### Next feature work, in order

#### 0. Split arsenals from campaigns — `docs/data-model-v3.md`

**Step 1 of 5 is built and tested (v0.19.0). Nothing in the running app imports
it yet.** An arsenal is now a durable personal object that exists before any
campaign, and a campaign is the table — who is playing, which arsenal each of
them brought, and aftermath writing back into those arsenals.

It is not a matter of taste. One campaign per leader is why there are six
campaign rows for five users, why `campaigns.member_of` is a campaign row
pointing at another campaign row, and why this file used to warn you not to put
your own second leader in `campaign.arsenals[]`. **D1 already models it
correctly** — `arsenals` has had its own table with `campaign_id` and
`user_id` since 0001 — so this is moving the client document toward the schema
already beneath it.

**What exists now**, all pure, all tested, importing nothing from React:

```
src/lib/shape/arsenal.js    the durable personal object + its selectors
src/lib/shape/campaign.js   the table: weeks, house rules, participations, games
src/lib/shape/ownership.js  belongsTo / shouldRelease / claim — shared by both kinds
src/lib/shape/migrate.js    v2 → v3 split, and the export/import trio
scripts/migrate-check.mjs   dry-runs the lift against a real export, read-only
```

93 tests across the three. `src/lib/campaignShape.js` is untouched and is still
what the app runs on; it retires at the cutover.

**Two rules of the shape worth not undoing:**

- **`shape/` and `campaignShape.js` must not import each other.** The whole point
  of the new module having no dependency on the old one is that the old one can
  be deleted outright at step 3. The v0.1 leader lift was re-inlined as
  `migrateLeaderToArsenal` rather than chained through the old function for
  exactly this reason.
- **`belongsTo` lives in one file for both kinds of object.** Two kinds of owned
  thing answering "may I see this?" in two places is how they eventually answer
  it differently.

**Next, in this order:**

0. ~~**The pure shape**~~ and ~~**the UI cutover**~~ are **done** (v0.19.0,
   v0.19.2). What is left is the sync half — see the sync warning above, and
   items 4 and 5 of the plan.

1. ~~**Run `migrate-check` against a real export.**~~ **Done 2026-09-03, and it
   passed.** Run against all six live campaigns pulled from remote D1 — every
   model, injury, equipment row, scrip total, experience box, advancement and
   game survived, every model carried an id, and both ids were preserved on all
   six. `backups/hodgepodge-2026-09-03-campaigns.json` is the input; re-run it
   any time with:
   `node scripts/migrate-check.mjs backups/hodgepodge-2026-09-03-campaigns.json`
2. ~~**The UI, local storage only, sync off.**~~ **Done, v0.19.2.** The lift, the
   two-document hook, the shelf of arsenals, and every component moved off
   `campaignShape.js`, which is deleted. Verified in the browser: a seeded v2
   campaign lifted with its scrip, models, injuries, kit, experience and game
   history intact; a week was played (a hire at the right discounted price)
   and persisted; a reload re-ran the lift as a no-op; a new leader got its own
   table.

   **What has not happened is a real week on the *new shape*.** A real game was
   played on 2026-09-02 — Mads v Dalton, and it is what item 0b came out of —
   but that was on v2, before the cutover. So the shape has been exercised by a
   browser and not yet by an evening. That is the next thing and it is the whole
   point of the step.
3. **Migration 0005**, then generalise sync **last**.

Two things from the plan that are easy to get wrong and expensive to undo:

- **Do not copy the sync machinery for a second object type.** Generalise
  `knownVersion`/`markDirty`/`planSync` over a `kind` once. Two divergent
  copies of the code that can lose twelve weeks is the worst possible outcome
  of this change.
- **Build the shape, migrate locally, and play a real week before touching
  D1.** §12b already says schema built on guesses is expensive once anyone has
  saved data — and now other people have.

The conflict-resolution screen listed under Known issues should probably ship
**first**: an arsenal changes every week, so conflicts get more likely, not less.

#### 0a. The first real game also *confirmed* the arithmetic

Mads v Dalton, 2026-09-02, recorded in the `campaign-play` channel. Two people
worked the aftermath out by hand at the table and posted the numbers; the app
agrees with all four:

| | table | `src/lib/campaign.js` |
|---|---|---|
| Dalton, 4 VP, won | 3 scrip | `payday` → 3 |
| Madeline, 3 VP, lost | 1 scrip | `payday` → 1 |
| Dalton's hand (2 schemes) | 3 cards | `aftermathHandSize` → 3 |
| Madeline's hand (1 scheme) | 2 cards | `aftermathHandSize` → 2 |

Worth writing down because it is a different *kind* of evidence from the tests.
`payday` and `aftermathHandSize` have always been tested against fixtures
transcribed from the same book the code was — which cannot catch a
misreading — and this is the first time either has been checked against a game
two people actually played and settled between themselves. §6's "where a claim
is about an external source, go and look" applies to the table as much as to the
register.

It also shows what the app is *not* holding. Both barter flips, both aftermath
hands and both advancement flips were posted as photographs in Discord, because
there is nowhere in the app to put them — which is item 0b's first bullet
arriving as evidence rather than as a feature request.

#### 0b. What the first real game asked for — `docs/data-model-v3.md`

The owner played a game with this app on 2026-09-01 and came back with four
things. All four are designed at the end of the plan doc; none is built.

- **A crew builder with a shared session.** Start an encounter, the opponent
  joins, both sides pick from their arsenals and equipment and then reveal. No
  other tool can do this, because no other tool can hold a leader that does not
  exist on a card. It belongs to v3: an encounter happens between two *arsenals*
  at a *table*, which is what a participation joins. It also makes the campaign
  rating computable instead of typed.
- **Record the aftermath hand, and spend it.** Today phase 1 stores a number and
  the player holds four real cards the app knows nothing about. `hand: [{ value,
  suit, spentOn }]`, offered at every later flip. **This does not weaken the rule
  that the app owns no fate deck** — every card is still typed in, and there must
  never be a "flip for me" button.
- ~~**Scrip from an under-spent hire**~~ — **it was the starting arsenal, and it
  was a real bug. Fixed v0.19.1.** Two rules, one scrip, and do not re-derive
  either:
  - **p. 15, starting arsenal** — "Each soulstone a player chooses not to spend
    during this step becomes one scrip, up to a maximum of three scrip."
    `Record` has *displayed* that number since v0.1 and never written it to the
    arsenal: the screen said "22/25 spent · 3 scrip" and the campaign began with
    zero. See `startingScripPatch`.
  - **p. 19, hiring for an encounter** — "Players may use excess soulstones from
    hiring to increase their pool as normal." Those become soulstones in that
    game's pool and never scrip. If anyone wants them as scrip it is a house
    rule, and the still-missing half is that nothing shows the leftover at all.
- ~~**The aftermath must go backwards, then lock.**~~ **Shipped v0.22.0.** It
  went the way this bullet asked — the truth moved, rather than a Back button
  being bolted on. The record was already the provenance, so `src/lib/rewind.js`
  replays it backwards; see the v0.22.0 section above for the four rules in it.
  The premise that "barter, the doctor and the injury flips all append and would
  double on a revisit" was **already false** when the v0.21.1 audit checked it:
  every phase derives its remaining work from the record.

#### 1. ~~Campaign membership~~ — shipped v0.17.0

Owner-issued invites and the shared arsenal page, in
`functions/lib/membershipStore.js`, `functions/api/membership/[[path]].js`,
`src/hooks/useMembership.js` and `src/components/steps/Players.jsx`.

**The risky change was avoided, not tested.** This section used to warn that
widening read from owner to member "is precisely the change that created the
`arsenal_models` hole in v0.7.0". It would have been — if membership meant
several people writing one campaign row. It does not. Every player still owns
their own campaign row and `campaignStore.js`'s write path is unchanged;
membership is a pointer, `campaigns.member_of`, from a player's campaign to the
host's. The shared page is one read across campaigns linked to the host.

Rules that are easy to undo and should not be:

- **Two gates.** Redeem → `pending`; only the host admitting you → `active`;
  only `active` reads anything. A forwarded link must cost the host a decision,
  never a leak. `roleIn` returns a role rather than a boolean so nothing can
  treat pending as in.
- **The nickname is the only identity that crosses**, unless the member opts
  in per campaign. `share_identity` defaults to 0. `publicMember` is the one
  function that decides what leaves — keep it that way, and keep every read
  going through it.
- **User ids do not cross.** The host gets them on the member list, because
  admitting has to name a row. Nobody gets them on the shared arsenal page. A
  user id outlives the campaign and correlates an arsenal to a person forever,
  which is what the nickname exists to prevent. This was a real leak in the
  first draft, caught by its own test.
- **The shared read never touches `doc`.** `doc` is the whole campaign; a
  member is entitled to the arsenal (public by p.14), not the rest. Asserted.
- **Tokens are stored hashed** and shown once. Single-use is enforced in the
  claiming UPDATE's `WHERE redeemed_by IS NULL`, not by the SELECT above it.
- **Membership is not cached locally**, unlike everything else here. It is the
  answer to "who may see my data", and a stale answer to that is worse than
  none.

`join_code` in migration 0001 remains unused and should stay unused.

49 authorization tests in `functions/lib/membershipStore.test.js`, including
the five this section demanded. Proven over real HTTP against a local D1 with
forged sessions; see the version history.

#### 2. ~~Aftermath~~ — shipped v0.16.0

All six phases, one stateful flow, in `src/lib/aftermath.js` and
`src/components/Aftermath.jsx` plus `components/aftermath/`. The arsenal
sheet's blank boxes are filled with it.

Rules that were expensive to get right and are easy to undo:

- **One flow, never six screens.** The deck is not reshuffled between phases,
  so the hand drawn in phase 1 cheats every flip through phase 6. The record
  lives on the game, so an aftermath survives a closed tab and syncs.
- **The app owns no fate deck.** Every flip is typed in. Do not add a "flip for
  me" button — it would be a different game, because the economy is one hand
  spent across six phases.
- **`cheated` changes three answers** and is asked for only where it does.
- **Annihilation is checked at the END of phase 6**, never during it.
- **Three flip semantics** — `orLower`, `exact`, `choose`. Widening `exact` to
  `orLower` on the totem table would be a strictly better campaign than the
  book's, silently.

Still to do here:

- **Widen the D1 projection.** `injuries`, `equipment` and `games` have tables
  in migration 0001 and still ride only inside `doc`. Now that the shapes are
  real and played, the guesswork migration 0002 warned about is gone.
- **Peons are never flagged.** `createModel` has `peon`, the injury phase
  honours it, and nothing sets it — the hire screen has no checkbox and the
  register's `characteristics` are not read for it. Until then a peon can be
  ticked as killed and asked to flip.
- **Optional rules (pp. 146–151) are unbuilt.** Competitive campaign wins are
  already countable (`gamesWon`); weekly events, bounties and the black market
  are not.

#### 3. ~~Visual design pass~~ — shipped v0.9.0

The records-office direction is **retired**. `src/styles/tokens.css` now opens
with the campfire rationale; read it before changing a colour, and do not
"restore" the old greys — they were replaced on purpose, by owner decision.

What is left of this item is **art, not code**. The portrait is real as of
v0.9.1; `road-horizon.svg` is still a placeholder drawn in code. The remaining
slots are specified in `docs/ART_BRIEF.md`, and the highest-value one is a
second and third Hank portrait keyed to `HankSays`'s existing `tone` prop, so
he visibly changes when a leader dies — it costs one line of code.

#### Smaller, any time

- **The dialogue counter script.** `scripts/` still has no counter, and §5's
  dialogue check depends on whoever runs it inventing a correct regex. The
  v0.5.2 audit's M6 was a false positive for exactly that reason. A generator
  that writes `hank-dialogue.md` from `hank.js` would retire the dual-file rule
  entirely.
- **Nine low audit findings**, catalogued in `docs/audits/audit-v0.5.2.md`.
  L2 is closed: `VITE_REGISTRY_MODE=local` reaches `loadLocalRegister` now, and
  `useRoster` reads the seeded file.

### Never verified

- ~~**Every BiggerHat call.**~~ **Verified 2026-08-22.** `/keywords/{slug}`,
  `/characters/{slug}`, `/keywords?search=` and `/factions` all executed against
  the live register. `/keywords/{slug}` returns **thin** records with no actions,
  so `useRoster.js`'s second-fetch path is the one that runs — it was the
  unproven branch and it works. Still unexercised: `/strategies`, `/schemes`.

  Their OpenAPI spec is at `https://biggerhat.net/docs/api.json` (not
  `/openapi.json`). **There is no crew-card endpoint** — the Malifaux namespace
  has characters, actions, abilities, upgrades, triggers, keywords, factions,
  markers and tokens; `/crews/{shareCode}` is a user-built crew list, not the
  starting crew card effects, which are book content and live in
  `src/data/crewCards.js`.

  Three traps in `/characters`, all found the hard way in v0.5.1:

  1. **`per_page` must be sent on every page.** Omit it on page 2 and the
     server re-serves the tail of page 1 rather than erroring — a naive loop
     collects duplicates and silently misses the real remainder. `per_page` is
     capped at 100 however much more you ask for.
  2. **Faction slugs diverge from ours.** The register uses `ten_thunders` and
     `explorers_society`; we use hyphens, because our slugs are written into
     saved campaigns and cannot be renamed. An unknown faction returns **zero
     rows, not an error**, so a wrong slug is a silent empty result. The map
     lives in `src/data/factions.js` as `registerSlug`, and is tested.
  3. **The faction index carries `keywords` and `characteristics`; the keyword
     index does not.** That asymmetry is the whole reason Versatile detection
     is possible in two requests instead of one per model.
- ~~**The register proxy Function.**~~ **Verified 2026-08-18** —
  `/api/v1/factions` returns real faction JSON from BiggerHat in production.
  First BiggerHat call ever to actually execute. The other endpoints are still
  unproven; see the bullet above.
- ~~**All auth code.**~~ **Verified end to end 2026-08-18.** A real Discord
  sign-in completed: consent screen, callback, token exchange, `upsertUser`,
  the D1 write, session creation, and the badge's signed-in state with a live
  avatar and name. The remote database holds one user row and one session
  expiring in 30 days. Confirmed by schema inspection at the same time: the
  `users` table has no email, password, or token column, so the privacy claim
  is structural rather than a matter of discipline.
  Sign-out verified too: the D1 `DELETE` runs and the badge returns to signed
  out. Still unexercised: session expiry sweeping, and Google as a provider.

  **Preview deployments cannot sign in**, and this is not a half-finished
  setup — no preview redirect URI exists. Both registered URIs are production
  (`hodgepodgehearthside.com` and `hodgepodge-hearthside.pages.dev`, the bare
  host being the production alias). Preview builds live at `<branch>.` and
  `<hash>.` subdomains. Harmless until the remote storage adapter, at which
  point testing signed-in writes would otherwise mean using the live database;
  `docs/SETUP_D1_AUTH.md` has the three steps to enable it.
- ~~**D1 sync.**~~ **Verified in production 2026-08-22** — the owner confirmed
  the same arsenals showing on phone and computer. The adoption path (signed-out
  work pushed up on first sign-in) and the cross-device pull were both proven
  against a local D1 with a forged session first, since Discord has no preview
  redirect URI.
- **Account erasure in production.** `DELETE /api/account` is proven against a
  local D1 — every count to zero, a second account untouched, the dead session
  refused — but deliberately never run against the live database, because the
  only real account on it is the owner's.
- **`migrateLeaderToCampaign`.** Tested against a synthetic record only. The
  *v3* lift on top of it is no longer in this category — `splitLegacyCampaign`
  was run against all six real campaigns on 2026-09-03 and lost nothing.
- **Restoring a backup to *remote*.** The 2026-09-03 dump was restored into a
  throwaway SQLite database and verified row for row, which proves the file. It
  has never been applied to the live database, and doing so means dropping what
  is there first — see `backups/README.md`.
- **The corrected PDF.** The three v0.6.0 print fixes are CSS and `.noprint`
  classes verified in the DOM; no print dialogue has ever been opened from this
  environment. The owner's next export is the proof. Same for the new arsenal
  sheet's two-page break.

### Written but not wired

Nothing of substance. Aftermath, barter, healing, advancement, annihilation and
the campaign-end line are all wired as of v0.16.0.

What is left is one dialogue function: **`healSkipped`**, deliberately unused.
It reads as Hank accepting a decision the player has not made yet, which is the
timing rule (§2), and the doctor phase ends the moment you skip it — so there
is no later moment to say it in. It stays in `hank.js` because a future screen
with a real "you paid nothing" moment could use it.

### Known issues

**High:** none currently.

~~**Unresolved by design — conflicts need a person.**~~ **Built, v0.20.0.**
`ConflictNotice` shows both copies in the player's own terms and offers keep
mine / take theirs / keep both, with a download of both sides first. The old
advice this section described — "open it on one device and save to settle it" —
was **impossible to follow**: a conflict means the copy is already dirty and the
base version already differs, so saving changes neither and the next reconcile
reports the same conflict for ever. It is gone.

Three rules in it worth not undoing:

- **It never interrupts.** The conflicted state is safe — both copies intact —
  so it waits on the shelf. Being asked which copy of your leader is real, three
  phases into an aftermath at a table, is the worst possible moment for a
  question that could have waited until Thursday.
- **"Keep both" is the recommended answer**, and is the only one that cannot be
  wrong: the local copy forks to a new id and stays on the shelf, so the decision
  becomes reversible. Offered for arsenals only — a forked campaign leaves its
  participations pointing at the original table, which turns one conflict into
  several.
- **Identical copies settle themselves** (`sameInSubstance`), and nothing else
  ever does. That is provably lossless; everything else is the owner's call.

**Still unexercised against a real conflict**, because sync is off. The pure
layer has 38 tests and the screen was driven in a browser against an injected
conflict; neither is the same as two devices disagreeing.

**Medium:**
- **`road-horizon.svg` is still placeholder art**, drawn in code as a
  silhouette so it reads as deliberate rather than broken. Hank's portrait is
  real as of v0.9.1. `docs/ART_BRIEF.md` holds the render sizes and the §8
  constraints for whatever replaces the horizon.
- **The 1.9 MB `16-bit-hank.png` master is inside `public/`**, so Cloudflare
  serves it publicly even though no page requests it — only the 33 KB WebP
  derivative is ever loaded. Harmless for page weight, but if `public/` should
  hold only what ships, move the master to a non-served folder and update the
  regeneration command in `docs/ART_BRIEF.md`.
- **The print output has never been seen since the redesign.** Two print-only
  fixes shipped in v0.9.0 (hiding the firelight pseudo-element, which would
  otherwise wash every printed page) and both are CSS asserted in the source
  rather than observed. Same standing gap as the PDF export.
- **Nothing may leave the masthead with only Leaders on it.** Every tab but
  Leaders is gated on `inCampaign`, so a shelf with campaigns and none *open*
  collapses the navigation and reads as the app having lost them. §12b's rule
  only ever covered not *closing* a campaign; nothing opened one, so a campaign
  that arrived by sync, or the campaign left behind after discarding the open
  one, sat there closed. `App` now opens the most recently updated when nothing
  is open — **without navigating**, so the tabs appear and the view does not
  move. Fixed v0.18.2.
- **Five views now**, and the rule that keeps them coherent: `library` (the
  shelf) → `arsenal` (the standing view of one campaign) → `sheet`, `create`,
  `campaign`. Leaders is a *view*, not an exit — switching to it must never
  close the open campaign, or the other tabs vanish and it reads as losing your
  place. Opening a different leader is the only close. Aftermath, barter,
  healing and advancement live in the Campaign view beside the hire, as its
  second sub-tab — one place, because the evening runs hire, play, aftermath,
  hire again, and splitting them across the top navigation would read as two
  separate places.
- **The arsenal sheet's blanks are down to two, and both are deliberate.** The
  equipment half of the campaign rating counts kit *hired for a game*, which has
  no value between games (the sheet prints "N + kit hired"); and the totem's
  actions come off a card §4 does not let this app store. Everything else —
  games won, equipment, per-model injuries, the experience track, the totem's
  identity and stats — is filled as of v0.16.0.
- **Peons are never flagged.** `createModel` carries `peon`, phase 6 honours it,
  and nothing sets it: the hire screen has no checkbox and the register's
  `characteristics` are not read for it — even though that is exactly where the
  answer is, and where `isVersatile` and `isTotem` already read from. Reading it
  at hire time is a small change and would close this. Until then a peon can be
  ticked as killed on the game log and asked to flip, which the book forbids.
- **The totem gets no characteristics.** The book grants a totem "up to two
  characteristics... in the same manner as for your leader" (p.32). `createTotem`
  carries the field and `ArsenalSheet` prints it; nothing sets it. The leader's
  picker became `characteristicOptions` in v0.18.3 and is a component away from
  being reusable there.
- `hank.js` and `hank-dialogue.md` are kept in sync by hand. A generator script
  in `scripts/` would make the code the single source. Not written — though the
  v0.21.1 audit proved the two files agree exactly (241 of 241) and recorded the
  three traps any checker has to survive.
- **The doctor's `addsInjury` outcomes are not applied.** Three of the seven
  Back-Alley Doctor results hand the patient a fresh injury — the black joker's
  "Oops?" and the 9 — and `onAttempt` only spends the scrip and heals. The
  ledger says "healed, then hurt" while the arsenal records only the healing.
  Noticed while building the rewind; not fixed there, because it is a rules
  change rather than a navigation one.
- `useCampaign` exposes a flat `leader` adapter so the four wizard steps didn't
  need rewriting. Fine now; retire it once the wizard reads the arsenal
  directly, or it becomes a second shape to keep in sync.
- **A `hank.js` line is filed under the wrong moment.** `AFTERMATH_INJURED[0]`
  opens with "Well howdy again friend, it's been a hot minute… Anyway, how'd
  things go?" — that is an *arrival* line, and it fires at the injury flip,
  after the player has already described the game. A §2 violation sitting in the
  data rather than in the code. Left alone this session because it is the
  owner's voice to rewrite, and any change to it is a dual-file change (§1).
- ~~**`updatedAt` is still a client clock**~~ — **retired in v0.18.5.**
  Migration 0004 adds a server-assigned `campaigns.version`, incremented on
  every accepted write. `planSync` now decides from two facts it was *told*
  rather than two clocks it compared: the version this copy descends from
  (`knownVersion`) and whether it has unsent edits (`isDirty`). Clean and
  behind pulls; edited and current pushes; **edited and behind is a conflict,
  reported and left alone** — neither copy is touched, because silently picking
  a winner is precisely how the data was lost. `updatedAt` survives for sorting
  and for humans, and decides nothing.

  A bridge remains: where the version facts are missing — a row from before 0004,
  or a device that has not pulled since — it falls back to the clock comparison.
  That path is bounded, since one pull retires it per campaign per device, and
  deleting it outright would strand every copy already on a disk.

  **What made this catastrophic rather than merely imperfect was fixed in
  v0.18.4, and the lesson is worth more than the fix.** `useCampaign` stamped a
  fresh `updatedAt` on every *read* — the guard meant to prevent that compared
  object identity against an object `loadCampaign` had just built, so it never
  once fired. Merely loading the page made this device's copy the newest in
  existence and it won every merge. A stale device overwrote good work every
  time its owner reloaded to check whether the good work had arrived, which is
  a loop that hides its own cause: **the act of looking was the act of
  destroying.**

  v0.18.0's `baseVersion` gate did not catch it, and the reason is subtle
  enough to write down. `useSync` records the server's version for every
  campaign in the listing *before* `planSync` decides anything, so by the time
  a push happens the client always holds a "version it was told". The gate then
  reads as satisfied. Its contract — *"has this client seen the copy it is
  replacing?"* — became true of the **device** while staying false of the
  **document**, which never merged anything. A guard phrased about a client but
  enforced against a document will pass every time.
- **The version a device last saw lives in `campaign-version:<id>`, never on the
  campaign.** It was on the doc for about ten minutes and the next keystroke
  wiped it: `useCampaign` writes React state to storage on every edit, and that
  state does not know about fields the sync layer adds behind it. It is also not
  campaign data — on the doc it would ride into the JSON export and into `doc`
  on the server, where it is meaningless and wrong after an import.
- Project lives inside OneDrive. Usually fine, but OneDrive syncing
  `node_modules` mid-install can cause file-lock errors. First suspect for any
  inexplicable build failure.

**Low:**
- Clicking **Sign in** when the provider is unconfigured navigates the whole
  window to raw JSON (`{"message":"discord is not configured..."}`, HTTP 501)
  with no way back but the browser's back button. Correct behaviour, ugly
  delivery. Only reachable if the Pages secrets are missing, so it disappears
  once step 5 of `SETUP_D1_AUTH.md` is done — but the same page is what a user
  sees if Discord itself is unreachable. An HTML error page in
  `functions/api/auth/[provider].js` would fix it.
- `HankSays` renders `aria-hidden`, so narration is visual-only. Deliberate —
  a screen reader user shouldn't wade through 200 words to reach a form field —
  but revisit if anyone asks for it announced.
- Thresholds in `hireGreeting` (flush ≥8 scrip, broke ≤2) and
  `hireReaction` (expensive ≥9) are guesses. Tune after real play.

---

## Repository map

```
hodgepodge-hearthside/
├── CLAUDE.md               this file — read first
├── wrangler.toml           D1 binding — for the CLI *and* the deployed site
├── public/
│   ├── sw.js               service worker — READ ITS HEADER before editing
│   ├── manifest.webmanifest
│   └── art/                owner-drawn art plus the icons derived from it
├── migrations/             D1 schema, append-only
├── functions/              Cloudflare Pages Functions — edge, never bundled
│   ├── lib/
│   │   ├── auth.js         OAuth, sessions, sameOrigin; may hold secrets
│   │   ├── campaignStore.js  ALL authorization lives here — read the header
│   │   └── campaignStore.test.js  16 attack tests; the most important here
│   └── api/
│       ├── v1/[[path]].js  BiggerHat proxy (scoped to /v1 so it can't eat /auth)
│       ├── campaigns/      list, read, upsert, delete — scoped to the caller
│       ├── account.js      DELETE — erases the account and everything on it
│       └── auth/           sign-in, callback, me, logout
├── src/                    the browser app
│   ├── data/               facts from the book + all of Hank's dialogue
│   │   ├── equipment.js    the barter table + Those Who Thirst — NAMES ONLY (§4)
│   │   ├── injuries.js     injury chart, Lucky Miss, back-alley doctor
│   │   └── advancements.js six tables + the leadership experience track
│   ├── lib/                pure logic, imports nothing from React
│   │   ├── shape/          THE SHAPE — v3, and what the app runs on
│   │   │   ├── arsenal.js    the durable personal object
│   │   │   ├── campaign.js   the table — weeks, participations, games
│   │   │   ├── ownership.js  belongsTo, shared by both kinds
│   │   │   └── migrate.js    v2→v3 split + export/import; the dangerous one
│   │   ├── shelf.js        storage ↔ shape seam; holds the v2→v3 lift
│   │   ├── aftermath.js    the six phases, as arithmetic
│   │   ├── rules.js        live rules text, memory-only (§4)
│   │   ├── remote.js       the D1 client + planSync, the merge that can lose data
│   │   ├── reconcile.js    runReconcile — the sync loops, injectable and tested
│   │   ├── rewind.js       going back through an aftermath, and what it costs
│   │   └── recordImage.js  canvas PNG + the LEGAL constant
│   ├── hooks/              useCampaign, useRoster, useRules, useAuth, useHank, useSync
│   ├── components/         wizard steps and shared UI
│   │   ├── ArsenalLibrary.jsx  the shelf — one card per leader
│   │   ├── ArsenalSheet.jsx    the official sheet's fields, our look
│   │   ├── LeaderRecord.jsx    the filed record, shared by two views
│   │   ├── FlipInput.jsx       one card, typed in — the app owns no deck
│   │   ├── WeekControl.jsx     the week, and the means to disagree with it
│   │   ├── Aftermath.jsx       the six-phase walk
│   │   ├── aftermath/          the game log and the four phases with screens
│   │   ├── steps/Campaign.jsx  hire + aftermath, under one week
│   │   └── steps/Arsenal.jsx   the standing view of one campaign
│   └── styles/             tokens.css holds the design direction
├── docs/
│   ├── VERSION_HISTORY.md  why things were done this way
│   ├── data-model.md       campaign shape + D1 schema design
│   ├── data-model-v3.md    THE PLAN: split arsenals from campaigns — read first
│   ├── sync-v3-plan.md     steps 4 and 5: the schema, the sync, and not losing data
│   ├── hank-dialogue.md    numbered reading copy of the narration
│   └── SETUP_D1_AUTH.md    one-time dashboard setup
└── scripts/
    ├── seed.mjs            optional bulk register pull
    └── migrate-check.mjs   dry-runs the v2→v3 lift on a real export; read-only
```

---

## Working agreement

Source of truth for how this project is built. If you find yourself about to
break one of these rules, stop and ask rather than deciding it's fine this once.

---

## 1. The dual-file rule — Hank's dialogue lives in two places

**Every change to Hank's dialogue must be made in BOTH files, in the same
turn:**

| File | What it is | Who reads it |
|---|---|---|
| `src/data/hank.js` | The arrays and picker functions the app imports | The running app |
| `docs/hank-dialogue.md` | Numbered, grouped reading copy | A human deciding what to write next |

They are not duplicates serving the same purpose. The code holds selection
logic; the doc holds the numbering (`L-03`, `BA-07`, `AL-02`) that makes lines
referable in conversation. Neither replaces the other.

Nothing enforces this. If you update one and not the other, the doc quietly
starts lying — and the doc is what a human reads when deciding what to write
next, so the lie compounds.

**Checklist for any dialogue change:**
1. Edit `src/data/hank.js`
2. Edit `docs/hank-dialogue.md` with the same text
3. Update the counts line at the bottom of the doc
4. If a new group was added, update the "Selection order" section
5. Verify the file still loads: `node --input-type=module -e "import('./src/data/hank.js').then(m => console.log(Object.keys(m).length))"`

If this ever becomes tiresome, the fix is a generator script in `scripts/` that
writes the markdown from the code. That would make the code the single source.
It has not been written; until it is, do it by hand and do it every time.

---

## 2. The timing rule — write for what the app knows *at that instant*

The single most violated rule, because it is invisible until someone plays.

The app learns things in an order. On arrival at the aftermath it knows the
week number — **not** the result, and **not** whether anyone was hurt, since
injuries come out of flips partway through. A greeting cannot react to a game
nobody has described yet.

This is why most steps split into two or three moments rather than one:

| Step | Moment 1 | Moment 2 | Moment 3 |
|---|---|---|---|
| Aftermath | greeting (week only) | reaction (result known) | injury line (at the flip) |
| Barter | greeting (hand size) | acquired / empty | — |
| Hire | greeting (scrip) | reaction (model known) | — |
| Selections | greeting (archetype) | slot prompt | pick reaction (cost vs cap) |
| Healing | greeting (injury count) | healed / can't afford | — |
| Annihilation | leader falls | recovery or permanent loss | — |

**Before writing any new line: work out what is known when it renders.** If the
line needs a fact the app doesn't have yet, it belongs at a later moment.

---

## 3. Boundaries Hank never crosses

- **He never describes what an action does.** The app deliberately doesn't store
  rules text (see §4), so any line commenting on an effect would be inventing it.
  He can react to *cost against a ceiling*, because that's a fact we hold.
- **He comments on prices, he never sets them.** No line may suggest a barter
  rating shifted, a hire cost moved, or a discount was granted on his say-so.
  He describes the first-hire discount as "how the road works" — never as a
  favour he did.
- **He is silent during data entry.** Recording strategy, schemes, and VP is
  someone finishing a chore. Don't narrate it.
- **He never delivers rules-gap explanations.** Those use `.gap-note` and show
  in both modes. See §5.

---

## 4. What the app stores, and what it deliberately drops

`src/lib/indexing.js` strips every `description` field on the way in. What's
kept is identifiers: model name, cost, faction, keywords, and the *names* of
actions and abilities. That is exactly what the legality rules need — cost
ceilings and keyword overlap — and nothing more.

Two reasons, and the second is the durable one:

1. Wyrd gives their card library away free and sells the cards, so republishing
   the text competes with the funnel that sells product.
2. Card text changes with errata. Names and costs change far less. Storing text
   would make you its permanent maintainer.

**Never add a field that carries rules text to anything that persists.** Not to
the indexed model, not to a localStorage key, not to the JSON export, not to
D1. If a feature seems to need that, the feature is wrong.

### The service worker must never cache /api/ — added v0.14.0

The app is installable, which means there is a `public/sw.js` with a Cache
Storage at its disposal. **Nothing under `/api/` may go into it.**

`/api/v1/*` is the BiggerHat proxy. A cached response there is card text on
disk, outliving the tab and no longer refreshed by an errata — which is exactly
what this section forbids, and it would quietly undo the trouble `rules.js`
goes to in holding that text in a module-level Map. The same bypass also keeps
`/api/auth/*` from serving a stale identity and `/api/campaigns/*` from serving
somebody's twelve weeks wrong, so one `return` covers all three.

It is the first branch in the fetch handler. Do not add an exception to it.

### The display-only exception — added v0.5.0 by owner decision

Rules text **may be shown**, provided it is fetched live and never kept.
`src/lib/rules.js` is the only module allowed to hold it, in a module-level Map
that dies with the tab. It imports nothing from `storage.js` except the
download helper, and nothing writes it back.

This splits the two reasons above rather than overriding them. Reason 2 is
fully preserved: nothing is cached across sessions, so a Wyrd errata takes
effect on the next page load and this app never becomes the text's maintainer.
Reason 1 was the owner's call to make, and was made — with the note that
BiggerHat already republishes the same text publicly under the same fan policy.

The line to hold:

| Allowed | Not allowed |
|---|---|
| Fetching `description` for display | Persisting it anywhere |
| The record, hover tips, crew cards | Putting it in the JSON export |
| Drawing it into a PNG/PDF the player asked for | Caching it in localStorage or D1 |

`toIndexedModel` and `toCard` are near-identical normalisers on purpose — one
is deliberately lossy and the other deliberately is not. **Do not merge them.**
Everything that persists travels the lossy path.

An export the player explicitly asks for is a page they already have on screen,
so the PNG and the print sheet carry the text. The JSON export does not, because
that file is the durable one (§8).

**Showing text is not the same as showing everything the register returns.** A
register action arrives with its triggers attached; a leader that took that
action from an ally does **not** get them. Triggers are earned in campaign play
or granted at creation, and only the Heavy Hitter is granted one. So
`EntryBody` takes `showTriggers`, off on the leader's record and on every slot
where no trigger is up for grabs, on for crew cards, which describe the actual
hired model. Getting this wrong prints rules the leader does not have, and the
mistake is invisible — which is why `rules.test.js` asserts the absence.

---

## 5. The Hank toggle

Defaults **on**. He's the reason this is a companion rather than a form with
cost validation.

The switch exists for the player mid-game who wants the number, the screen
reader user who'd rather not hear 200 words before a form field, and anyone who
doesn't care for the voice.

**What the toggle must never hide: rules-gap explanations.** Those are
substance wearing a costume. Use `.gap-note`, never `<HankSays>`. Someone who
turned Hank off still needs to know the app floors negative scrip at zero.

---

## 6. Architecture rules

**`src/lib/` imports nothing from React.** Every rule and calculation is a plain
function taking data and returning data. This is why `campaign.js` was fully
tested before any UI existed. When adding a feature: arithmetic into `lib/`
with tests first, component second. That ordering keeps the rules debuggable
when a scrip total is disputed at the table.

**Validation stays split in two.** `checkStructure` needs only the archetype
(slot counts, whether a trigger is legal). `checkSource` needs the register
(cost ceiling, keyword overlap, master/totem exclusion). That split is why the
wizard works with zero data loaded and degrades to typed entry instead of
dead-ending. **Do not merge them.**

**Master/totem exclusion leans on `cost > 0` and `characteristics`, never on
`station`.** The register returns `station: null` on records that clearly should
have one — verified: no record in any faction carries `station: 'Totem'`, and
known totems come back `null`, `Peon` or `Minion`. Masters have no cost at all,
so the cost check catches them; **totems have no cost either**, so it catches
them too, and `isTotem` reads `characteristics` as a second, independent guard
that would survive the register giving one a cost.

Two comments claimed the opposite of this for two audits — one said totems were
"perfectly hirable" and kept in the roster, the other that they "HAVE costs" so
the cost test missed them. Both were wrong, they contradicted each other, and
the machinery built on the second (`totemSlugs`, an `isTotem` marking pass, a
cache-key bump) was dead the whole time because it marked an already-filtered
list. Fixed in v0.16.0. **If you find yourself reasoning about what the register
returns, fetch it instead** — that is what settled it in ten seconds.

**`src/` and `functions/` never import from each other.** Both have a `lib/`
folder and that's fine — they run in different runtimes. `functions/lib/` runs
on Cloudflare's edge and may hold secrets; `src/lib/` is bundled and shipped to
the browser. An import across that line would drag server code into the client
bundle. If genuinely shared logic appears, create a third top-level `shared/`
folder — not before.

**Migrations are append-only.** Once `migrations/000N_*.sql` has run against the
remote database, never edit it. Add `000N+1`. An edited applied migration means
the file and the real schema disagree with nothing to warn you.

**Everything degrades.** Any network path needs a manual fallback. The register
is a donation-funded community project that can be down or unreachable, and
game night doesn't wait.

---

## 7. Hank's character bible

Facts established. Contradicting these is a continuity error.

- **Hank** — the Hodgepodge Emissary, an **Outcast** peddler. Wide hat, everything
  he owns strapped to his donkey. Warm, wry, takes your side. Been travelling a
  long time and has buried people.
- **Henrietta** — his donkey. Female. **Donkey, not mule** — the one exception is
  L-01's idiom "a mule kick to the teeth," which is a saying, not a reference
  to her.
- **Dr. Morbidius Spiritstitch, "Dr. Mo"** — unlicensed surgeon camped over the
  rise. Doesn't do credit. Questionable knives. Never explained further, because
  Hank has been carefully not asking for years.
- **Imagery is the ROAD, never the swamp.** He travels; he isn't a Bayou fixture.
  No crawdads, gators, marsh, or bayou.
- **Language: minced oaths only.** "Sam Hill," "dad-gummit," "doggoned." No
  profanity. A man who *won't* curse in front of you, not one who lacks the
  words — the swallowed insult (`L-03`: "them low-down, no-account— ooh.") is a
  move he has, and reads angrier than a swear.
- **Register shifts by moment.** Default amused. Amusement is *wrong* after a
  loss and *absent entirely* during annihilation. He can be funny about Dr. Mo;
  never about the player's losses.
- **Repeating steps need rotation.** Aftermath fires ~12 times, hire ~11. Pools
  are indexed by week number, not random, so week seven always reads the same —
  two players comparing screens shouldn't see different text.

---

## 8. Legal constraints — check before publishing

Wyrd's Fan Site and Art Policy permits this. The conditions are real:

- **Non-commercial.** No ads, no tiers, no upsell. This cannot become a Draconic
  Designs revenue project. The policy's only monetization exception is
  ad-supported web video.
- **Freely accessible to the public.**
- **The disclaimer appears on every page.** It's in `App.jsx`. Never remove it.
- **No Wyrd trademark in the domain.** hodgepodgehearthside.com is clear.
- **Don't copy their trade dress.** This deliberately doesn't resemble their
  cards or their app. Keep it that way. `ArsenalSheet.jsx` is the test case:
  it matches the official sheet **field for field**, so a player finds
  everything where they expect it, in this app's own type and palette. Owner
  decision, v0.8.0 — "design something better, but capture everything from the
  original". Copying the layout was offered and declined.
- **Permission is revocable at any time, for any reason.** Which is why every
  campaign must export to JSON — someone's twelve weeks has to survive this app
  going away. Treat data portability as a requirement, not a nice-to-have.

If AI features are ever added: bring-your-own-key only. Paying per generation
would make it commercial, and you can't recoup it.

Community tools can be submitted at wyrd-games.net/community-creators.

---

## 9. State of the build

See `## ⚠️ NEXT SESSION` above — that block is the live status and is updated
every session. `docs/VERSION_HISTORY.md` holds how it got this way.

---

## 10. Commands

```bash
npm install
cp .env.example .env
npm run dev      # Vite only — NO Functions, NO database. useAuth degrades to signed out.
npm run test     # 503 tests; `functions/` is in the run too, for the authz tests
npm run build    # production bundle — the dev proxy does NOT exist here
npm run seed     # optional local register file; ask BiggerHat's maintainer first

# Functions + D1 locally (needs a build first)
npx wrangler pages dev dist

# D1
npx wrangler d1 execute hodgepodge-hearthside --local  --file=./migrations/0001_init.sql
npx wrangler d1 execute hodgepodge-hearthside --remote --file=./migrations/0001_init.sql
```

`npm run dev` serves no Functions, so sign-in and any `/api/*` call will fail
there by design. That is not a bug — `useAuth` and `useRoster` both degrade.

---

## 11. Two proxies, not one

**Routing note:** the register proxy is scoped to `/api/v1/`, NOT `/api/`. A
catch-all at `/api/` would swallow `/api/auth/*`. Keep new API surfaces in
their own namespace.

`vite.config.js` proxies `/api` in **development only**. In production that job
belongs to `functions/api/v1/[[path]].js`, a Cloudflare Pages Function that fetches
upstream at the edge and caches for an hour.

**If you change the API base path, change it in both.** A mismatch works
perfectly in `npm run dev` and fails only once deployed, which is the worst
possible place to find out.

Host-specific note: this Function is Cloudflare Pages syntax. Moving to Netlify,
Vercel, or anywhere else means porting it — the dev proxy is portable, the
production one isn't.

---

## 12. Persistence — local first, D1 behind it

**As of v0.7.0 campaigns sync to D1.** The arrangement is deliberately
lopsided and must stay that way:

- **localStorage is the working copy.** `useCampaign` writes it synchronously
  and the running app reads it. Every screen works with the network down.
- **D1 is a mirror.** `useSync` pushes each local save up and pulls the
  account's shelf down. Every failure is survivable — the status line on the
  shelf says so and the app carries on.
- **Signing in adopts.** Anything built while signed out is pushed to the
  account on first sign-in. `planSync` decides: remote-only pulls, local-only
  pushes, and where both exist the newer `updatedAt` wins with ties keeping
  local. It is pure and tested, because it is the only code here that can lose
  somebody's twelve weeks.

**D1 has no row-level security.** It is SQLite; there is no policy engine and
no `auth.uid()`. Supabase needs RLS because PostgREST exposes the database to
the browser — D1 never is, the binding lives only inside a Function. So there
is no anon key to leak, *and* every authorization decision is code in
`functions/lib/campaignStore.js`. The rule there: **every exported function
takes `userId` first and one gate checks ownership before any write.** An
earlier version guarded each statement individually and the `DELETE FROM
arsenal_models` had no owner column to guard on — a signed-in stranger could
wipe another player's model rows. Found by attacking it locally. Per-statement
guards are not enough; the gate is.

**The three things that stand in for RLS**, since none of them is automatic:

1. `requireSubject` throws if a store function is called without a user, so a
   missing id becomes an exception rather than a query across everybody's rows.
2. One ownership gate before any write, not a guard per statement.
3. `functions/lib/campaignStore.test.js` — 16 tests that run the store against
   a fake D1 and assert what was *actually* sent: every read binds the caller,
   a cross-account write runs exactly one statement and deletes nothing, and
   the owner is never taken from the payload. These are the most important
   tests in the project; the hand-run version of them found the real hole.

Mutations also require a same-origin `Origin` header (`sameOrigin` in
`functions/lib/auth.js`) — a second lock behind `SameSite=Lax`, in case that
cookie attribute is ever loosened for an unrelated reason.

**Personal data, and the way out.** The `users` table holds a Discord id,
display name and avatar URL. No email, no password, no tokens — no columns for
them. `DELETE /api/account` erases the account, its campaigns, arsenals, model
rows and sessions, clears the cookie, and the client clears localStorage too.
Nothing is soft-deleted: the honest answer to "delete my account" is that the
rows stop existing.

**The `doc` column is the source of truth; the normalized columns are a
projection.** Migration 0002 explains why: `injuries`, `equipment` and `games`
are still unwritten and Aftermath will reshape them, so normalizing now would
be guessing. Read from `doc`, scope and list from the columns.

## 12b. Original persistence plan

`docs/data-model.md` is the design for campaigns, accounts, and Cloudflare D1.
**Not implemented.** Read it before touching storage.

Two rules it establishes that are easy to violate:

- **Play is gated behind an account.** Changed in v0.4.8 by owner decision; the
  rule here previously read "accounts are for sharing, not for using — never
  gate play behind a login", and that is no longer true. `SignInGate` closes
  the wizard to anyone not signed in, so every campaign is owned by a `users`
  row from the moment it is created.

  What the gate must never do is strand someone. Three obligations ride on it:
  the JSON export stays reachable from the gate itself, so existing local work
  can always be rescued; the legal disclaimer renders on the gate screen like
  every other page (§8); and when the backend is unreachable the screen says so
  plainly instead of offering a button that cannot work.

  **A backend outage no longer blocks play for a device that has signed in
  before** — changed in v0.15.0 by owner decision, when the app became
  installable. "A backend outage blocks play entirely" was the accepted cost of
  gating, and an app you can put on a home screen and then cannot open without
  a signal is a worse promise than a bookmark had been.

  So a successful sign-in is remembered on the device (`src/lib/session.js`)
  and stands in when `/api/auth/me` cannot be reached. The rule it turns on:

  > An answer of "nobody is signed in" is authoritative and clears the
  > remembered session. **No answer at all** is what the fallback is for.

  `available` stays false throughout, so `useSync` still refuses to push and
  the shelf still says where the data is — it just says "working offline, this
  will sync" rather than "not signed in". Local edits are pushed by the normal
  reconcile when `available` flips back to true, which an `online` listener
  now provokes.

  The remembered session grants nothing on the server. It decides two things:
  whether the wizard opens, and which local campaigns are visible. Every D1
  read and write still needs the real cookie, and `campaignStore.js` still
  takes the owner from the session rather than the payload. It is cleared on
  sign-out and on account deletion — so signing out still means the next person
  sees nothing.

  The gate still stands, unchanged, for a browser that has never seen anyone
  sign in.

  Local development uses `VITE_ALLOW_UNAUTHENTICATED=true` in `.env`, which
  opens the wizard **only** when the backend is genuinely absent. It cannot
  open a real signed-out session in production, where `available` is true, and
  deployed builds never carry the flag because it is not among `wrangler.toml`'s
  `[vars]`.
- **Never loop a query per arsenal or per model.** D1's free plan caps a Worker
  invocation at 50 queries. Fetch sets.

**Five views, and Leaders is not an exit.** `library` (the shelf of *arsenals*),
`arsenal` (the standing view of one — leader record, roster by week, crew cards),
`sheet` (the arsenal sheet), `create` (the wizard) and `campaign` — which since
v0.16.0 holds the weekly hire *and* the aftermath as two sub-tabs under one
week control, because the evening runs hire, play, aftermath, hire again.
Switching to the shelf must not close what is open: doing so made the other tabs
vanish, which reads as losing your place. Opening a different leader is the only
close. Since v0.19.2 what is open is an **arsenal**, and its campaign comes with
it — `App` still opens the most recently updated arsenal when nothing is open,
without navigating.

**Arsenals live on the shelf; campaigns are the tables they sit at.** Changed at
v0.19.2, and this section used to say the opposite — read `docs/data-model-v3.md`
before changing any of it. Storage holds six keys:

```
arsenals:index   ids only        campaigns:index   ids only
arsenal:<id>     the arsenal     campaign:<id>     the table
arsenals:active  what is open    campaigns:active  its table
```

Neither index stores a leader name or faction — those are derived and would go
stale on a rename, so the shelf reads each document to draw its card.

**What a player opens is an arsenal.** The campaign comes along because the
arsenal names it in `campaignId`. A solo player's campaign is created silently by
`createSeatedArsenal` and never mentioned, so soloing and a table of five run one
code path rather than two.

**An arsenal is in at most one campaign at a time.** `joinCampaignPatch` throws
rather than reassigning. Scrip, weeks and experience are per-campaign quantities;
a leader at two tables has two contradictory histories and the arsenal sheet can
print neither. The same leader at a second table is `duplicateArsenal` — identity
and surviving models, none of the history.

**`campaign.arsenals[]` is gone**, and with it the warning that used to live
here telling you not to put your own second leader in it. A second leader is a
second arsenal on the shelf. Encounter size reads across the participations
(`encounterCapFor`) rather than into a nested array.

`schemaVersion` is **3** on both kinds of document. `shape/migrate.js` chains
every earlier shape into it: v0.1's single leader (`migrateLeaderToArsenal`),
v1's bare `{slug,name,cost}` models (`repairModel`, filed under
`STARTING_ARSENAL_WEEK` so they cannot eat a first-of-week discount), and v2's
nested arsenal (`splitLegacyCampaign`). `shelf.js` runs the lift on load, parks
the untouched v2 document under `v2-backup:campaign:<id>` first, and is safe to
run every time.

Build order matters: get the `Campaign` shape right locally and play a few real
weeks *before* writing a migration. Schema built on guesses is expensive to fix
once anyone has saved data.

---

## 13. The known rules gap

The weekly hire is mandatory and the first model each week costs 5 less scrip,
so a 3-cost first hire computes to −2. The book never says what happens.
Resolving it as a refund would be an infinite scrip engine.

`hireCost` floors at zero and applies the out-of-keyword surcharge before the
discount, and exposes both as house-rule options so a group reading it
differently isn't fighting the app. See `src/lib/campaign.test.js`.

**Surface this in the UI when the hire step is built** — visible in both Hank
modes, via `.gap-note`.
