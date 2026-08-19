# CLAUDE.md — Hodgepodge Hearthside project context

<!-- HH v0.4.4 | Last updated: 2026-08-18 -->

---

## Current Version: 0.4.4

## Last Updated: 2026-08-18

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
  (next scheduled: **Session 10**). Sessions are counted rather than version
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

### Blocking — do these before writing features

1. ~~**D1 does not exist yet.**~~ **Done 2026-08-18.** Database
   `1d11431a-0507-4ab3-90c2-f2213fb2f831` created, `0001_init.sql` applied
   local and remote, ten tables verified, binding confirmed live from
   `wrangler.toml` with no dashboard config. Nothing to do here.

   **Kept as a warning: `/api/auth/me` is NOT a valid checkpoint for the
   binding** — it was listed as one until v0.4.2 and it cannot work.
   `currentUser` short-circuits on `if (!sessionId || !env.DB) return null`,
   so with no session cookie it returns before touching the database. An
   unbound `env.DB` returns exactly the same `{"user":null}` as a correct
   binding. What proves the binding is a request that actually queries D1:
   `npx wrangler d1 execute hodgepodge-hearthside --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`
   (ten tables, plus Cloudflare's internal `_cf_KV`), or a real sign-in.
2. **No OAuth app registered.** Steps 4-5 of the same doc. The redirect URI
   must match exactly and must be registered for BOTH the custom domain and
   the `.pages.dev` URL.

### Next feature work, in order

1. **Weekly hire UI.** Highest value: fires eleven times a campaign, and both
   halves are already written — `hireCost` in `campaign.js` (tested) and 42
   lines of narration in `hank.js`. Needs the `.gap-note` for the negative-scrip
   house rule, visible in both Hank modes.
2. **Aftermath.** Six ordered phases; see `AFTERMATH_PHASES`. Must be ONE
   stateful flow, not six screens — the fate deck isn't reshuffled between
   phases.
3. **Remote storage adapter.** `src/lib/storage.js` still writes only to
   localStorage. Split into local/remote behind the existing interface; local
   stays the fallback, never a stepping stone.
4. **Visual design pass.** Functional but plain. Tokens are in
   `src/styles/tokens.css`; the records-office direction is deliberate and
   documented in the file header.

### Never verified

- **Every BiggerHat call.** Paths come from their OpenAPI spec, not a live
  response. `/keywords/{slug}` may return characters with actions attached, or
  thin records needing a second fetch — `useRoster.js` handles both, but only
  one path has ever executed.
- ~~**The register proxy Function.**~~ **Verified 2026-08-18** —
  `/api/v1/factions` returns real faction JSON from BiggerHat in production.
  First BiggerHat call ever to actually execute. The other endpoints are still
  unproven; see the bullet above.
- **The OAuth round trip.** Everything up to the redirect is now exercised:
  the Functions deploy and route, `/api/auth/me` returns `{"user":null}`,
  `useAuth` drives a real sign-in control, and `beginOAuth` returns a clean 501
  when a provider is unconfigured. What has never run is the redirect itself
  and everything after it — the callback, token exchange, `upsertUser`, session
  creation, and `useAuth`'s signed-in branch. No account has ever existed.
- **`migrateLeaderToCampaign`.** Tested against a synthetic record only.

### Written but not wired

Aftermath, barter, weekly hire, healing, advancement, annihilation, campaign
end. Both halves exist — arithmetic in `src/lib/campaign.js` (tested), narration
in `src/data/hank.js`. Missing piece is UI plus the `Campaign` object.

### Known issues

**High:** none currently.

**Medium:**
- `hank.js` and `hank-dialogue.md` are kept in sync by hand. A generator script
  in `scripts/` would make the code the single source. Not written.
- `useCampaign` exposes a flat `leader` adapter so the four wizard steps didn't
  need rewriting. Fine now; retire it once the wizard reads the arsenal
  directly, or it becomes a second shape to keep in sync.
- Totem advancements are hardcoded to 0 in `ratingForGame` — totems aren't
  modelled yet.
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
├── migrations/             D1 schema, append-only
├── functions/              Cloudflare Pages Functions — edge, never bundled
│   ├── lib/auth.js         OAuth + sessions; may hold secrets
│   └── api/
│       ├── v1/[[path]].js  BiggerHat proxy (scoped to /v1 so it can't eat /auth)
│       └── auth/           sign-in, callback, me, logout
├── src/                    the browser app
│   ├── data/               facts from the book + all of Hank's dialogue
│   ├── lib/                pure logic, imports nothing from React
│   ├── hooks/              useCampaign, useRoster, useAuth, useHank
│   ├── components/         wizard steps and shared UI
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

**Never add a field that carries rules text.** If a feature seems to need it,
the feature is wrong.

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
  cards or their app. Keep it that way.
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
npm run test     # 45 tests across campaign.js and campaignShape.js
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
belongs to `functions/api/[[path]].js`, a Cloudflare Pages Function that fetches
upstream at the edge and caches for an hour.

**If you change the API base path, change it in both.** A mismatch works
perfectly in `npm run dev` and fails only once deployed, which is the worst
possible place to find out.

Host-specific note: this Function is Cloudflare Pages syntax. Moving to Netlify,
Vercel, or anywhere else means porting it — the dev proxy is portable, the
production one isn't.

---

## 12. Persistence plan

`docs/data-model.md` is the design for campaigns, accounts, and Cloudflare D1.
**Not implemented.** Read it before touching storage.

Two rules it establishes that are easy to violate:

- **Accounts are for sharing, not for using.** Signed out, the app must work
  fully against local storage. Never gate play behind a login.
- **Never loop a query per arsenal or per model.** D1's free plan caps a Worker
  invocation at 50 queries. Fetch sets.

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
