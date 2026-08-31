# Audit — v0.11.0

Date: 2026-08-31 · Sessions 1–29 · 8,915 lines across `src/`, 949 across
`functions/`

Second audit. It was due at Session 20 and ran at Session 29 — nine sessions
late, across which the app gained D1 sync, account erasure, an arsenal sheet,
a complete visual redesign, leader portraits, and a pinned masthead. The
v0.5.2 audit closed with a note that "audit due" should block the next feature
rather than join the queue. It did not, and this catalogue is longer for it.

Method per CLAUDE.md §5: `CLAUDE.md` and `docs/VERSION_HISTORY.md`, then every
file in `src/`, then this catalogue — **written before any fix code**. Extended
past `src/` in one place: `functions/lib/campaignStore.js`, because the first
finding turns on what the server does when two accounts share a browser, and
reading only the client would have got that wrong.

**Written as findings only.** Status added afterwards — see below.

---

## Status — fixed in v0.12.0, same session

| Finding | Outcome |
|---|---|
| P1 shadows on paper | **Fixed.** `box-shadow` and `text-shadow` cleared for print. |
| P2 crew card split | **Fixed.** The card may split; its tail may not be orphaned. Headings cannot end a page, the foot cannot be separated from what it closes, and `orphans`/`widows` are set. |
| H1 cross-account shelf | **Fixed.** Campaigns carry `ownerUserId`; the shelf, `open`, and sync all scope to it. Nothing is deleted — an unsynced campaign belonging to someone else stays on disk, it simply is not shown. The push loop no longer stops at the first failure. |
| H2 unimportable exports | **Fixed.** All three buttons export the campaign. |
| H3 dead rescue | **Fixed.** The gate reads the shelf, exports a bundle when there is more than one, and `adopt` now accepts a bundle so the rescue can actually come back. |
| M1 two model shapes | **Fixed.** The weekly hire passes the same four fields the starting arsenal does. |
| M2 blank screens | **Fixed** and verified in the browser — Sheet and Creation step 4 both show the "not finished yet" route out. |
| M3 retired token | **Fixed.** Also removed the now-unused `--ember-dim` alias. |
| M4 totems not excluded | **Fixed.** `totemSlugs` is wired: `useRoster` marks `isTotem`, `checkSource` rejects it, `candidatesFor` drops it. The roster cache key is versioned, or existing browsers would never see the change. |
| M5 over-claiming message | **Fixed.** The cost message no longer names totems; the totem rule has its own message and its own test. |
| L1, L4, L5, L11, L14 | **Fixed.** |
| L2, L3, L6, L7, L9, L10, L12, L13 | Open. |

`totemSlugs` is no longer dead, so L3 is now only `loadLocalRegister` and
`useRoster.addManual`.

**Tests went from 158 to 175.** The two new rules are asserted rather than
described: `belongsTo` has four cases in `campaignShape.test.js`, and a new
`validation.test.js` covers `checkSource` — including that the cost message no
longer claims to bar totems, which is the wording that was false for eight
versions.


---

## Status of the v0.5.2 findings

| Finding | Now |
|---|---|
| H1 import | **Fixed** and verified — the shelf has *Import from JSON*, and `adopt` mints a fresh id so nothing is overwritten. |
| M1 arsenal shape | **Fixed** for the starting arsenal — and **reopened from the other end**. See M1 below. |
| M2 stale error | **Fixed** and verified — `clearError` runs on success. |
| M3 duplicate cards | **Fixed** and verified — grouped, with `×N`. |
| M4, M5, L8 print | **Fixed** in the source. Unverified against a real print since the redesign; see the note under *Not findings*. |
| M7 stale headers | **Fixed** and verified — both headers now state the gate correctly. |
| M6 dialogue drift | Retracted, and **still correctly retracted**. See the dialogue check below. |
| **M8 totem exclusion** | **STILL OPEN.** `totemSlugs` is exported and called from nowhere, exactly as in v0.5.2. |
| L1–L7, L9, L10 | **All still open.** Individually verified this pass. |

**CLAUDE.md is wrong about this.** It states "The audit's high and all mediums
are closed." M8 is a medium and is untouched. The v0.5.2 status table never
claimed otherwise — it lists M1–M5 and M7 and stops — so the error was
introduced when the summary was written into CLAUDE.md, and has been repeated
in the status block ever since.

---

## Summary

| Priority | Count | Theme |
|---|---|---|
| Print | 2 | shadows on paper; a card split across a page boundary |
| High | 3 | one account's data shown to another; two broken portability promises |
| Medium | 5 | one shape bug, one blank screen, one dead token, two stale claims |
| Low | 14 | carried-over dead code, stale comments, cosmetic drift |

All three highs are about **data crossing a boundary it should not** — between
two accounts, or between the app and a file that cannot come back. §8 makes
portability a requirement rather than a nicety, and two of the three break it.

The v0.5.2 audit's own lesson was "export the artefacts and read them." It was
followed for JSON this time and found H2. It was **not** followed for print,
because no printer was reachable from this environment — and the print path has
since been through a full redesign. That gap is named below rather than
glossed.

---

## High

### H1 — Signing out leaves the previous account's campaigns on the shelf

`useAuth.signOut` clears the cookie and sets `user` to null. **Nothing clears
localStorage.** The only code that does is the account-erasure button in
`ArsenalLibrary`, which is a different action with a different meaning.

So on a shared browser:

1. A signs in, builds campaigns. They are in localStorage and in A's D1 rows.
2. A signs out. The shelf still holds every one of them.
3. B signs in. `useSync.reconcile` reads `campaignIds()` — A's campaigns — as
   `mine`, fetches B's as `theirs`, and `planSync` classifies A's as local-only.

Two consequences, and the second is the one that will get reported as a bug
without anyone realising the first happened.

**B sees A's leaders.** They render on the shelf, open, export, and discard.
The app labels them "YOUR LEADERS" and the sync line says "Synced to your
account." Both are false. Sign-out is the control whose entire purpose is that
the next person does not see your things.

**B's own campaigns then stop syncing.** `planSync` pushes A's campaigns up;
`putCampaign` finds a row owned by A and returns `forbidden`, which the
endpoint deliberately renders as **404** ("whether an id exists is not a
question a stranger gets an answer to"). `remote.put` throws, and
`reconcile`'s push loop does `break` on the first failure — so every campaign
after it in the list is never pushed, on this reconcile or any future one,
because the stale row is still there to fail again. The status line reads
"Saved here, but not to your account — Not found."

The server side is not at fault and should not be changed: the ownership gate
did exactly its job, and the 404-not-403 choice is right. This is entirely a
client-side lifecycle problem — the local shelf is scoped to the browser while
everything else is scoped to the account.

Worth stating plainly because it is the reassuring half: **no data reaches the
wrong account in D1.** The gate holds. The exposure is local, and the sync
breakage is a denial of service against the second user.

`src/hooks/useAuth.js:47`, `src/hooks/useSync.js:40-78`,
`functions/lib/campaignStore.js:96-102`, `functions/api/campaigns/[[path]].js:76`

### H2 — Two of the three "Export JSON" buttons produce files that cannot be imported

Three buttons carry that label, and they export three different shapes:

| Where | Exports | `adopt()` accepts it? |
|---|---|---|
| `ArsenalLibrary` (the shelf) | `campaign` | **yes** |
| `Arsenal` (the standing view) | `arsenal` | **no** |
| `Record` (creation, step 4) | `leader` — the flat wizard adapter | **no** |

`adopt` requires `incoming?.arsenals?.length` and otherwise throws *"That file
does not look like a campaign — no arsenals in it."* An arsenal object has no
`arsenals` array; the flat leader adapter has neither.

§8 does not treat portability as a feature: *"someone's twelve weeks has to
survive this app going away… treat data portability as a requirement."* Two of
three exports produce a file this app itself refuses. A player exporting from
the screen they happen to be on — which for the Arsenal view is the obvious
one, since it is the standing view of a campaign — gets a file that looks like
a backup and is not one.

The last audit's H1 was the same promise broken in the other direction: an
import that did not exist. It was fixed by building the import. The exports
were never revisited to match.

`src/components/steps/Arsenal.jsx:70`, `src/components/steps/Record.jsx:94`,
`src/components/ArsenalLibrary.jsx:141`, `src/hooks/useCampaign.js:127`

### H3 — The gate's rescue export cannot see any campaign made since v0.6.0

`SignInGate` offers to export local work so that nobody is stranded behind the
wall. It looks for that work here:

```js
const local = load('campaign:current') ?? load('leader:current')
```

Both are **legacy keys**. Since v0.6.0 campaigns live under `campaigns:index`
plus `campaign:<id>` per campaign; `campaign:current` is the pre-shelf key and
`leader:current` the pre-campaign one. `adoptLegacyCampaign` migrates the
former onto the shelf and, by design, *leaves the old key in place* — so the
rescue works for a browser that has not been migrated, and silently offers
nothing to every browser that has.

The gate renders when the backend is unreachable. CLAUDE.md §12b is explicit
that this is the accepted cost of gating play, and names the obligations that
make it acceptable — first among them: *"the JSON export stays reachable from
the gate itself, so existing local work can always be rescued."*

So the failure lands precisely in the scenario the obligation was written for:
D1 or the Functions are down, the player cannot get in, their twelve weeks are
sitting in localStorage, and the rescue paragraph does not render at all. There
is no error — the block is conditional on `local`, so it simply is not there.

`src/components/SignInGate.jsx:21`, `src/lib/storage.js:100-160`

---

## Medium

### M1 — Weekly hires store the whole register record; starting models store four fields

Audit v0.5.2's M1 was two shapes for one thing. It was fixed at the starting
arsenal, and the weekly hire has drifted the other way since.

`Record.jsx` is explicit and minimal:

```js
createModel({ slug: model.slug, name: model.name, cost: model.cost, addedWeek: STARTING_ARSENAL_WEEK })
```

`WeeklyHire` passes `picked` — the entire indexed roster model — through
`App.onHire` into `addModel`, and `createModel` spreads its patch last. So a
hired model is stored carrying `faction`, `secondFaction`, `station`,
`keywords`, `keywordNames`, `characteristics`, `isUnhirable`, `isBeta`,
`hasTotem`, `totemSlug`, `hasDetail`, every `action` with its `triggers`, and
every `ability` name.

Three consequences:

- **Two shapes again.** Anything reading a stored model has to cope with both.
- **The doc grows with the register, not with the campaign.** It goes into
  localStorage, into every sync push, into the JSON export, and into D1's
  `doc` column, which has a ~1MB row ceiling now shared with a portrait.
- **It is a second copy of someone else's data, and it goes stale.** §4's
  second reason for not storing card text — that errata makes you the
  maintainer — applies in weaker form to action *names* too.

Not a §4 violation: names and costs are exactly what §4 permits, and no
`description` is present. This is a shape and size finding, not a legal one.

`src/components/steps/WeeklyHire.jsx:62`, `src/App.jsx:216`,
`src/hooks/useCampaign.js:213`, `src/lib/campaignShape.js` (`createModel`)

### M2 — An unfinished leader renders a blank page on two of five views

`App.jsx` guards the arsenal view and offers a way out:

```jsx
{admitted && inCampaign && view === 'arsenal' && !archetype && ( …Carry on building them… )}
```

There is no equivalent for `sheet` or for `create` at `step === 3`. Both are
gated on `&& archetype` and render nothing when it is absent. The tabs are
shown whenever `inCampaign`, so both are one click away.

Reachable in the ordinary flow: `openCampaign` sets `step` to 3, so opening a
half-built leader and clicking **Creation** lands on step 3 with no archetype
and shows a page containing a **Back** button and the legal line. Observed
directly this session while testing something else.

`src/App.jsx:170-200`

### M3 — A retired design token is still referenced from a JSX inline style

`src/components/steps/Arsenal.jsx:118` styles the annihilated-models list with
`borderColor: 'var(--oxide-dim)'`. That token was renamed to `--coal-wash` in
v0.9.0. The rename was done with a scripted pass over `app.css` and **did not
cover inline styles in JSX**, so this one survived.

`var()` with no fallback and no definition makes the declaration invalid, so
the border silently falls back to the `.pick` rule's brass — the one visual
state meant to read as "this model is gone" instead reads like a live
selection. Cosmetic, but it is a regression introduced by this project's own
tooling, and the same class of miss could hide elsewhere: a grep for the four
other retired tokens found nothing, so this is the only instance.

`--ember-dim` also survives in `tokens.css` purely as an alias and is now
referenced by nothing.

`src/components/steps/Arsenal.jsx:118`, `src/styles/tokens.css:68`

### M4 — M8 from the last audit is open, and CLAUDE.md says otherwise

Unchanged since v0.5.2: `isSelectionSource` bars masters and costless models
via `cost > 0`, and totems have costs, so they pass. `totemSlugs(models)` was
written to build the exclusion set and **is still called from nowhere**.

What is new is that CLAUDE.md now asserts the opposite — "the audit's high and
**all mediums** are closed" — in the block a future session reads first. A
finding that is believed fixed is worse than one known open.

`src/lib/indexing.js:44-52,72`, `CLAUDE.md`

### M5 — The legality message tells the player a rule the code does not enforce

`checkSource` pushes this when a source is rejected on cost:

> Masters, totems and costless models cannot be used as a source.

Totems are named in the sentence and not in the check (M4). A player reading
that message will reasonably conclude a totem they were allowed to pick must
therefore not be a totem.

Separated from M4 because the fixes differ: M4 is "wire up `totemSlugs` or
delete it", this one is "the string must not claim more than the code does",
and whichever way M4 is decided, this string has to match.

`src/lib/validation.js:44`

---

## Low

| # | Finding | Where |
|---|---|---|
| L1 | *(carried)* `experienceEarned` says "Maximum three experience points"; the reachable maximum is 2 — path bonus plus loss. Comment or missing rule. | `campaign.js:141` |
| L2 | *(carried)* `VITE_REGISTRY_MODE=local` documented, exposed as `registry.mode`, `loadLocalRegister` written — nothing reads either. `npm run seed` still writes a file the app cannot load. | `api.js`, `.env.example` |
| L3 | *(carried)* Dead exports: `totemSlugs`, `loadLocalRegister`, `useRoster.addManual`. Indexed-but-unread fields still persist on every roster cache. | various |
| L4 | *(carried)* `forgetCards` documents itself as "for sign-out, where holding someone's text around is rude". `signOut` does not call it. Sharper now that H1 shows sign-out cleans up nothing at all. | `rules.js:298`, `useAuth.js:47` |
| L5 | *(carried)* CLAUDE.md §11 still cites `functions/api/[[path]].js`; the file is `functions/api/v1/[[path]].js`. §11 is the section warning about that exact scoping. | `CLAUDE.md:686` |
| L6 | *(carried)* `activeInjuryCount` says "counted once per titled group" and counts rows flat. | `campaignShape.js` |
| L7 | *(carried)* The two hire pickers disagree: Record sorts by cost and writes "5ss"; WeeklyHire is unsorted and writes "5". | `Record.jsx`, `WeeklyHire.jsx` |
| L9 | *(carried)* Stat lines write `Pulse 3"`; inline `{{pulse}}` renders uppercase `PULSE 2"` via `.rules__icon`. Visible together on one crew card. | `app.css`, `rules.js` |
| L10 | *(carried)* Two ways to total an arsenal — `arsenalTotal` direct vs `totalFor`, which excludes annihilated. Harmless pre-Aftermath. | `Record.jsx`, `campaignShape.js` |
| L11 | `App.jsx` comments "Three views now"; there are five, and CLAUDE.md says five. | `App.jsx:40` |
| L12 | The portrait renders on the shelf card and in the wizard only. `LeaderRecord`, `ArsenalSheet` and the canvas PNG never reference it — so it is absent from every artefact that leaves the app. | `recordImage.js`, `ArsenalSheet.jsx`, `LeaderRecord.jsx` |
| L13 | `syncRef.current = sync` is assigned during render rather than in an effect. Works, but it is a render-phase side effect and reads as one. | `App.jsx:66` |
| L14 | The M6 retraction documents **three** dialogue code formats. There are four — `H1-01`…`H1-06` put a digit in the prefix, which every pattern in that table rejects. This is what made the count read 235 against a true 241. | `docs/audits/audit-v0.5.2.md`, `hank-dialogue.md:291` |

---

## The §5 dialogue check

**`hank.js` and `hank-dialogue.md` agree, at 241 lines.** No drift.

Method, because the last audit got this wrong and the way it got it wrong is
the point. The code side was counted by **importing the module and walking
every exported value** — no pattern matching — which yields 242 strings, of
which one is `HANK_TOGGLE_KEY`, a localStorage key rather than a line. That
leaves **241**, matching the doc's own footer exactly.

The doc side, scanned with `^\*\*[A-Z]{1,3}-…`, returns **235** — and that
undercount is a fresh instance of exactly the M6 error. The missing six are
`H1-01` through `H1-06`: a prefix containing a digit, which `[A-Z]{1,3}`
cannot match. M6's retraction table lists three formats and would send the next
reader down the same hole.

A pattern that actually covers all four:

```
^\*\*([A-Z][A-Z0-9]{0,2}-[A-Za-z0-9][A-Za-z0-9-]*)\*\*
```

The durable fix remains the one named in v0.5.2 and still unwritten: count from
the code, or generate the doc from it. **Counting the doc by regex has now
produced a wrong answer twice.**

---

## Not findings

Recorded so a future audit does not re-litigate them. All verified this pass.

- **`src/lib` imports nothing from React.** Holds across all eleven modules,
  including `portrait.js`, whose DOM half takes the same licence `storage.js`
  does and imports no React either.
- **`src/` and `functions/` do not import from each other.** Neither direction.
- **Nothing persists rules text.** The only `description` in the persisting
  path is the sentence in `indexing.js` explaining that it is dropped. §4 holds
  — including for the portrait, which is an image and carries none.
- **Migrations are append-only.** `0001_init.sql` has exactly one commit
  touching it.
- **The D1 authorization gate holds.** `requireSubject`, one ownership check
  before any write, owner taken from the session and never the payload. H1
  exercises it and it refuses correctly.
- **Aftermath arithmetic is still unwired** and still referenced only by its
  own tests. Documented state, not rot.

## Print — checked after the fact

The owner supplied a real export the same session this audit was written, so
the gap named below was closed within hours of being named. Six pages, read by
inflating the content streams and decoding the subset fonts through their
ToUnicode maps.

**The v0.9.0 firelight fix works.** No full-viewport wash on any page; the
record and the crew cards print on white. The two print-only rules added blind
in v0.9.0 do what they were written to do.

### P1 — Every card prints its drop shadow

Each page paints a full-width black rectangle, alpha-blended, clipped to a
rounded rectangle: Chrome's rendering of `box-shadow`. The print block
overrides `background` and `border` on `.record` and `.crewcard` and never
touches `box-shadow`, so `--shadow-2` — a screen affordance for lifting a card
off a dark ground — is being sprayed onto paper. On a mono printer it is a grey
smear down two edges of every card.

Introduced in v0.9.0, when shadows were added to surfaces that had none.

`src/styles/app.css` print block

### P2 — A crew card splits and leaves its tail alone on a page

**Page 3 holds only the tail of the card that began on page 2** — its
`ABILITIES` section, the "read live from BiggerHat" note, and the legal
notice.

(An earlier draft of this finding said the heading had nothing under it. That
was the decoder, not the PDF: the ToUnicode map recovered only 108 glyphs and
dropped the ability names. `CrewCards` renders a section only when
`entries.length > 0`, so they were there. The split is real; the emptiness was
not.)

`.crewcard` carries `break-inside: avoid`, but it also carries
`break-before: page`, so every card starts its own page — and this one is
taller than a page, which makes `break-inside: avoid` impossible to honour.
Chrome then splits it wherever it likes, which was immediately before an empty
section heading.

This is v0.5.2's M5 one level up. That finding was the *foot* splitting away
from the record, and the fix pinned the foot. Here the whole card splits and
the foot travels with the fragment. The lesson L8 recorded for `.record` — an
element taller than a page cannot honour `break-inside: avoid`, and asking it
to only makes the break worse — was never carried across to `.crewcard`.

`src/components/CrewCards.jsx`, `src/styles/app.css` print block

---

### One thing that could not be checked

**The print output has still never been seen.** Three of the last audit's
findings (M3, M4, M5) came from reading an exported PDF and were invisible from
source. Since then the print path has been through a complete redesign — new
palette, new type, a fixed-position masthead, a full-viewport firelight
pseudo-element, and two print-only rules written to suppress that firelight,
none of which has been rendered to paper. Every print assertion in this audit
is source-reading only.

**This is the highest-value thing a human can do that this audit could not.**
One export, read.

---

## Suggested order

1. **H1** — one account's campaigns visible to another, and the second
   account's sync broken by it. Both halves; clearing local campaigns on
   sign-out fixes the first, and not `break`ing the push loop on a 404 fixes
   the second.
2. **H3** — the rescue is dead exactly when it is needed. One selector.
3. **H2** — decide what "Export JSON" means and make all three agree. The
   shelf's shape is the right one, since it is the only one Import accepts.
4. **M2** — a blank screen is reachable in two clicks from an ordinary state.
5. **M1** — before Aftermath, like its predecessor. Pass a slim model, not the
   register record.
6. **M4 / M5** — decide totems once, then make the code, the message and
   CLAUDE.md say the same thing.
7. **M3** — one string.
8. Lows as they are passed. L14 is worth doing with the dialogue script, since
   it is the same lesson twice.

## Note on cadence

The v0.5.2 audit closed by recommending that "audit due" block the next
feature. It was set to Session 20, and sessions 20 through 28 all shipped
features without it; the target was then rewritten mid-session-28 to "before
any further feature work" precisely because a session number kept slipping.
This audit ran at Session 29, on request.

Of the eight findings above that are not carried over, **four were introduced
in the nine sessions the audit was late** (H1 with D1 sync, M1 with the weekly
hire's Versatile handling, M3 with the v0.9.0 rename, L12 with portraits).
That is the cost of the delay, stated in the only terms that matter.

Next audit due: **Session 39**, or earlier on any of §5's other triggers —
and the membership feature is one of them, since it widens read access from
owner to member and is exactly the change that produced the `arsenal_models`
hole in v0.7.0.
