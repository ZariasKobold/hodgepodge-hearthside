# CLAUDE.md — Hodgepodge Hearthside project context

<!-- HH v0.8.0 | Last updated: 2026-08-22 -->

---

## Current Version: 0.15.1

## Last Updated: 2026-08-31

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

- Every 10 sessions, counted from the numbered entries in `docs/VERSION_HISTORY.md`
  (next scheduled: **Session 39**). The Session 20 audit was missed and finally
  ran at Session 29; four of that audit's findings were introduced during the
  nine sessions it was late, which is the argument for treating "audit due" as
  blocking rather than as a queue item. Sessions are counted rather than version
  numbers because a minor bump skips a patch series and makes a version-based
  target unreachable — which is exactly what happened to the old v0.3.10 target.
- Before any milestone that widens blast radius: first D1 write, first
  non-you user, submitting to Wyrd's Community Creators page
- After a session touching 8+ files or adding a shared module

Ritual: read this file and `docs/VERSION_HISTORY.md` in full, then every file
in `src/`, then catalogue findings by priority **before** writing fix code.
Save to `docs/audits/audit-vX.Y.Z.md`.

**Dialogue-specific audit:** confirm `src/data/hank.js` and
`docs/hank-dialogue.md` still agree. They drift silently and nothing catches it.

---

## ⚠️ NEXT SESSION — pending

### Where things stand — v0.9.0

Sessions 14–23 took this from a local-only leader builder to a synced,
multi-leader campaign tracker that no longer looks like municipal paperwork.
Shipped and live:

| | |
|---|---|
| **Rules text** | Fetched live from BiggerHat and shown on the record, on loadout hovers, and on crew cards. Never persisted (§4). |
| **Exports** | JSON, PNG (canvas), PDF (print stylesheet). Wyrd's disclaimer rides on all three. |
| **Versatile hiring** | The declared faction's Versatile models are hirable, grouped apart in both pickers. |
| **The shelf** | Many leaders, one campaign each. Import files a new one; nothing is overwritten. |
| **Arsenal view** | Leader record, ledger, roster grouped by the week each model arrived, crew cards. |
| **Arsenal sheet** | Every field of the official sheet, in this app's own type and palette. |
| **D1 sync** | Local-first, D1 mirrors. Signing in adopts anything built signed out. **Confirmed working across the owner's phone and computer.** |
| **Security** | Ownership gate, `requireSubject`, same-origin writes, 16 authorization tests, account erasure. |
| **The look** | v0.11.0. A camp at dusk. Owner-drawn hero across the masthead, pinned and shrinking on scroll; a 1024px reading column; a bottom navbar on phones. One firelight source, Rye on the wordmark, Alegreya everywhere else. The page behind the column is deliberately plain — a background of props was built and removed by owner decision. |
| **Hank has a face** | v0.9.1. Owner-drawn 16-bit medallion, served as a 33 KB WebP beside every line he speaks. See `docs/ART_BRIEF.md`. |

175 tests.

### Audits

`docs/audits/audit-v0.11.0.md` is the current one (Session 29), and it now
carries a status block. **Every finding is closed** — both print findings, all
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
**M8 is still open**, and this file claimed for eight versions that it was not:
totems are named in the legality message and not excluded by the check. The
ten lows are all still open too.

Two things from that work worth keeping:

- **The dialogue check needs a real counter.** M6's false positive came from a
  regex that assumed every code looks like `S-04`. The doc uses three formats
  (`XX-NN`, `XX-WORD`, `XX-FNN`) plus descriptive suffixes on `C-01 · Identity`.
  A naive pattern silently drops fourteen entries and "finds" drift that is not
  there. The counter script is still unwritten.
- **`createCampaign` spreads its patch last.** Passing `id: undefined` to blank
  a field overwrites the value it just generated, and `saveCampaign` then
  no-ops on the missing id. Strip keys, do not blank them.

### Blocking — none. Setup is complete as of 2026-08-18.

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

#### 1. Campaign membership — invitations and the shared arsenal page

Owner-requested, v0.8.0. Two halves:

**Invitations.** `join_code` exists in migration 0001 and is unused. Do **not**
ship a bare join code: it is a capability URL, anyone holding it is in, and
being in means seeing other players' Discord display names. The owner's words
were "so random people don't just decide to join your campaign and gain
information about your discord."

Build **owner-issued invites** instead: single-use, expiring, revocable, and
the owner approves who lands in the campaign. That needs a new table (0003,
append-only) — invite id, campaign, issuer, expires_at, redeemed_by,
redeemed_at, revoked_at.

**The shared page.** Arsenals are public information by the rules, so every
member sees every participant's arsenal on one page — read-only. Render them
with `ArsenalSheet`, which already exists and is the format people will want.

**The authorization change is the risky part.** Today every query scopes to
`owner_user_id`. This widens *read* from owner to member while *write* stays
owner-only. That is precisely the change that created the `arsenal_models` hole
in v0.7.0, so it lands with its own attack tests in
`functions/lib/campaignStore.test.js`:

- a non-member reading a shared campaign → refused
- a member writing another member's arsenal → refused
- a member deleting a campaign they do not own → refused
- a revoked or expired invite → refused
- a redeemed invite being reused → refused

The rule, stated before it exists in code:

> **Read** an arsenal if you are a member of its campaign. **Write** only your
> own. **Delete** only your own campaign.

Note this is the first time this app shows one user's data to another. Members
will see each other's display names; that is unavoidable if the page says whose
arsenal is whose, but it should be said on screen rather than discovered.

#### 2. Aftermath

Six ordered phases; see `AFTERMATH_PHASES`. Must be ONE stateful flow, not six
screens — the fate deck isn't reshuffled between phases, so a black joker spent
on barter can't reappear on injuries.

It is also what unblocks most of the arsenal sheet's blank boxes. Currently
ruled-and-empty because nothing tracks them: **games won, crew rating,
equipment (10 slots), per-model injuries, the leadership experience track, and
totems.** `ArsenalSheet.jsx` prints them blank on purpose — wire them as each
lands rather than in one pass.

When it lands, widen the D1 projection: `injuries`, `equipment` and `games`
have tables in 0001 and currently ride only inside `doc`.

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
- **Ten low audit findings**, catalogued in `docs/audits/audit-v0.5.2.md`. The
  most substantive is L2: `VITE_REGISTRY_MODE=local` is documented in
  `.env.example` and wired to nothing, so `npm run seed` writes a file the app
  cannot read.

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
- **`migrateLeaderToCampaign`.** Tested against a synthetic record only.
- **The corrected PDF.** The three v0.6.0 print fixes are CSS and `.noprint`
  classes verified in the DOM; no print dialogue has ever been opened from this
  environment. The owner's next export is the proof. Same for the new arsenal
  sheet's two-page break.

### Written but not wired

Aftermath, barter, healing, advancement, annihilation, campaign
end. Both halves exist — arithmetic in `src/lib/campaign.js` (tested), narration
in `src/data/hank.js`. Missing piece is UI plus the `Campaign` object.

### Known issues

**High:** none currently.

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
- **Five views now**, and the rule that keeps them coherent: `library` (the
  shelf) → `arsenal` (the standing view of one campaign) → `sheet`, `create`,
  `campaign`. Leaders is a *view*, not an exit — switching to it must never
  close the open campaign, or the other tabs vanish and it reads as losing your
  place. Opening a different leader is the only close. Aftermath, barter,
  healing and advancement belong in the Campaign view beside the hire.
- **The arsenal sheet has six ruled-but-empty sections** — games won, crew
  rating, equipment, per-model injuries, the experience track, totems. That is
  deliberate (a pencil beats a missing box) but each is a promise Aftermath has
  to keep.
- `hank.js` and `hank-dialogue.md` are kept in sync by hand. A generator script
  in `scripts/` would make the code the single source. Not written.
- `useCampaign` exposes a flat `leader` adapter so the four wizard steps didn't
  need rewriting. Fine now; retire it once the wizard reads the arsenal
  directly, or it becomes a second shape to keep in sync.
- Totem advancements are hardcoded to 0 in `ratingForGame` — totems aren't
  modelled yet, and the sheet's totem stat card is blank for the same reason.
- **`updatedAt` decides which copy of a campaign survives a sync**, and it is a
  client clock. Two devices with badly skewed clocks could let an older edit
  win. Acceptable for one player on two devices; revisit before a campaign has
  several people writing.
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
│   ├── lib/                pure logic, imports nothing from React
│   │   ├── rules.js        live rules text, memory-only (§4)
│   │   ├── remote.js       the D1 client + planSync, the merge that can lose data
│   │   └── recordImage.js  canvas PNG + the LEGAL constant
│   ├── hooks/              useCampaign, useRoster, useRules, useAuth, useHank, useSync
│   ├── components/         wizard steps and shared UI
│   │   ├── ArsenalLibrary.jsx  the shelf — one card per leader
│   │   ├── ArsenalSheet.jsx    the official sheet's fields, our look
│   │   ├── LeaderRecord.jsx    the filed record, shared by two views
│   │   └── steps/Arsenal.jsx   the standing view of one campaign
│   └── styles/             tokens.css holds the design direction
├── docs/
│   ├── VERSION_HISTORY.md  why things were done this way
│   ├── data-model.md       campaign shape + D1 schema design
│   ├── hank-dialogue.md    numbered reading copy of the narration
│   └── SETUP_D1_AUTH.md    one-time dashboard setup
└── scripts/seed.mjs        optional bulk register pull
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

**Master/totem exclusion leans on `cost > 0`, not `station`.** The register
returns `station: null` on records that clearly should have one. Masters have
no cost at all, so the cost check catches them regardless.

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
npm run test     # 187 tests; `functions/` is in the run too, for the authz tests
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

**Four views, and Leaders is not an exit.** `library` (the shelf), `arsenal`
(the standing view of one campaign — leader record, roster by week, crew cards),
`create` (the wizard) and `campaign` (the weekly hire). Switching to the shelf
must not close the open campaign: doing so made the other three tabs vanish,
which reads as losing your place. Opening a different leader is the only close.

**Campaigns live on a shelf, one per leader.** Since v0.6.0 storage holds
`campaigns:index` (ids only), `campaign:<id>` per campaign, and
`campaigns:active`. The index deliberately stores no leader name or faction —
those are derived and would go stale on a rename, so the shelf reads each
campaign to draw its card.

A campaign's `arsenals` array is for **other players**, not your other leaders:
max encounter size is min(both arsenals) + 6, so opponents have to live there.
Your second leader is a second campaign. Do not add leaders to that array.

`schemaVersion` is **2**. v1 let the creation wizard write bare
`{slug,name,cost}` into `arsenal.models`; `migrate` backfills what `createModel`
provides, and files those models under `STARTING_ARSENAL_WEEK` (0) so the
starting arsenal is not mistaken for week-1 hires — which would eat the
first-of-week discount.

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
