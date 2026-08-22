# Audit — v0.5.2

Date: 2026-08-22 · Sessions 1–16 · 5,951 lines across `src/`

First audit. It was due at v0.5.0 (18 files, a new shared module, a changed
standing rule) and two feature sessions landed on top of it before it ran.

Method per CLAUDE.md §5: `CLAUDE.md` and `docs/VERSION_HISTORY.md` in full,
then every file in `src/`, then this catalogue — **written before any fix
code**. One addition to the ritual this time: an exported PDF from a real
session was available, and reading it found three defects that no amount of
code reading would have.

**Written as findings only.** Status added afterwards — see below.

## Status — resolved in v0.6.0

| Finding | Outcome |
|---|---|
| H1 import | **Fixed.** Built, not reworded. The shelf has *Import from JSON*; a file is filed as a new leader and cannot overwrite anything. |
| M1 arsenal shape | **Fixed.** `Record.jsx` goes through `createModel`; `migrate` repairs stored campaigns at schemaVersion 2. |
| M2 stale error | **Fixed.** `useRules` clears a recorded failure once the card arrives. |
| M3 duplicate cards | **Fixed.** Grouped by slug, `×N` on the card. |
| M4 print chrome | **Fixed.** Heading, tally and button are `.noprint`. |
| M5 foot split | **Fixed.** `break-inside: avoid` on `.record__foot`. |
| M6 dialogue drift | **RETRACTED — no defect.** See below. |
| M7 stale headers | **Fixed.** Both corrected, with the reversal named. |
| L8 record break | **Fixed** in passing, while doing M5. |
| L1–L7, L9, L10 | Open. |

One regression was introduced and caught during the fix: filing the starting
arsenal under week 1 made it look like five weekly hires, which would have eaten
the first-of-week discount. It is week 0 now (`STARTING_ARSENAL_WEEK`), and
tested.

---

## Summary

| Priority | Count | Theme |
|---|---|---|
| High | 1 | a promise the UI makes and cannot keep |
| Medium | 7 | one shape bug, one state bug, three print bugs, two drifts |
| Low | 10 | dead code, stale comments, cosmetic inconsistency |
| Retracted | 1 | M6 — a measurement error, not a defect. See below. |

The high finding and M1 are both about **data outliving the app**, which §8
calls a requirement rather than a nice-to-have. Those are the two worth fixing
first regardless of what else gets picked up.

Three of the mediums (M3–M5) came from the exported PDF and were invisible from
the source. Worth remembering next audit: **export the artefacts and read
them.**

---

## High

### H1 — The app offers an import that does not exist

`SignInGate` tells a locked-out user, verbatim:

> This browser still holds an unsaved campaign. **Export it to JSON** — you can
> import it once you're signed in.

There is no import. `importJSON` exists in `src/lib/storage.js:79` and is
referenced by **nothing**; there is no `<input type="file">` anywhere in
`src/components/`.

Why this is the top finding rather than a papercut: the gate is shown to
someone who *cannot get into the app*. The export button is the escape hatch
§12 requires the gate to provide, and the sentence next to it describes a
return path that does not exist. Somebody following that instruction ends up
holding a JSON file and no way back in.

Two honest fixes, and they are not equivalent:

1. Build the import. Restores the promise, and §8 wants portability to be real
   in both directions.
2. Change the sentence. Cheap, immediate, and leaves the export as a one-way
   rescue — which is still worth having.

`src/components/SignInGate.jsx`, `src/lib/storage.js`

---

## Medium

### M1 — The arsenal is stored in two different shapes

`Record.jsx:66` writes models straight into the arsenal:

```js
set({ arsenal: [...leader.arsenal, { slug: model.slug, name: model.name, cost: model.cost }] })
```

Every other path goes through `createModel`, which adds `id`, `addedWeek`,
`scripPaid`, `titleGroup` and `annihilated`. So the starting arsenal and the
weekly hires are different objects wearing the same name.

Consequences, none of which surface yet:

- `removeModel(modelId)` filters on `m.id`. Starting models have none, so they
  can never be removed through the campaign path.
- `hiresInWeek(arsenal, 1)` matches on `addedWeek`. Starting models are
  invisible to it.
- Injuries key off `model.id` (`injuriesFor`, `injuryCountForModel`,
  `modelIsAnnihilated`). **A starting model cannot be injured or annihilated.**

That last one is the reason this is Medium and not Low. Aftermath is the next
feature, phase 6 is injuries, and the models most likely to be hurt in week one
are exactly the ones that cannot carry an injury. Fix before Aftermath, not
after.

`src/components/steps/Record.jsx:63-67`, `src/lib/campaignShape.js:88`

### M2 — A stale error hides rules text that later loaded fine

`useRules` writes `errors[slug]` on a failed fetch and **never clears it on a
subsequent success**. `RulesState` checks in this order:

```js
if (rules.isPending(slug)) …
const error = rules.errorFor(slug)
if (error) return <div …>{error}</div>   // ← wins forever
const card = rules.card(slug)
```

So: register blips while the record auto-loads → the entry shows the error →
the user clicks **Load crew cards** → the card arrives and is cached → the entry
still shows the error, because the error is consulted first and was never
cleared.

Reachable in normal use, since the record auto-loads and the crew cards are a
separate button over the same models.

`src/hooks/useRules.js:47-62,74-88`, `src/components/RulesText.jsx:65-83`

### M3 — Duplicate arsenal entries print duplicate crew cards

Found in the exported PDF: **Swashbuckler occupies pages 6 and 7, identically.**
The arsenal holds two, so `CrewCards` renders two.

`CrewCards` maps over arsenal *entries*, not distinct models:

```js
const loaded = withSlug.filter((m) => rules.card(m.slug))
…
{loaded.map((m) => <StatCard … />)}
```

The tally inherits it — the export reads "5 of 5 read" for four distinct
models. Hiring three Swashbucklers would print three identical pages.

Should group by slug and render once, with a count (`×2`) where it matters.

`src/components/CrewCards.jsx:82-85,123-125`

### M4 — Crew-card chrome prints into the PDF

Page 1 of the export ends with:

```
CREW CARDS 5 of 5 read
REFRESH CREW CARDS
```

A button, in a PDF. `CrewCards` renders `.slot__head` (label + tally) and
`.crew__bar` (the button) inside `<section className="crew">`, and none of it
carries `.noprint`. The `.crewcard` articles themselves should print; the
controls around them should not.

`src/components/CrewCards.jsx:88-115`, `src/styles/app.css` print block

### M5 — `.record__foot` splits, producing a page of nothing but the disclaimer

**Page 3 of the export contains the legal notice and nothing else.** Sir
Vantes's card ends on page 2 with "Read live from BiggerHat and not stored…",
and the `<PrintLegal />` inside the same `.record__foot` falls to page 3.

The print block sets `break-inside: avoid` on `.record`, `.crewcard`,
`.record__section` and `.crewcard__entry` — but not on `.record__foot`, which
is the one element that now has two children and sits at a page boundary.

`src/styles/app.css` print block

### ~~M6 — `hank.js` and `hank-dialogue.md` have drifted~~ — RETRACTED

**Withdrawn. There is no drift.** `hank.js` holds 241 dialogue strings and
`hank-dialogue.md` contains 241 numbered entries, with no duplicates. They
agree exactly.

The finding was a measurement error. The first count used
`^\*\*([A-Z]{1,4}[0-9]?-[0-9]{2})` — which assumes every code looks like
`S-04`. The doc actually uses **three** code formats, and the naive pattern
silently dropped fourteen real entries:

| Format | Example | Count | Matched by the bad regex |
|---|---|---|---|
| `XX-NN` | `S-04` | 221 | yes |
| `XX-WORD` | `SO-LUCKY`, `SO-FALLBACK-01` | 14 | no |
| `XX-FNN` | `AD-F01` | 3 | no |
| `XX-NN · Label` | `C-01 · Identity` | 3 | no (suffix inside the bold) |

Recorded rather than deleted for two reasons. A future audit running the
obvious regex will reach the same wrong answer, and should find this note
first. And the retraction is itself the lesson: the §5 dialogue check needs a
counter that knows the doc's real conventions, not a pattern invented on the
spot. **That script does not exist** — writing it (or the `scripts/` generator
that would make the code the single source) is the durable fix, and remains
unwritten.

Nothing to fix in either file.

### M7 — Two file headers still assert a rule that was reversed in v0.4.8

`AccountBadge.jsx`:

> "Signed out is a first-class state, never an error to recover from. The whole
> app works against local storage with nobody signed in and that has to stay
> true — accounts exist so a campaign can be SHARED, not so it can be used
> (docs/data-model.md §3). **Nothing here gates anything.**"

`useAuth.js` says the same thing in its own words.

Both are false. `SignInGate` closes the wizard to anyone not signed in.
CLAUDE.md §12 was rewritten and `docs/data-model.md:441` carries a
"Superseded in v0.4.8" note — so the two markdown files were updated and the
two source files were not. `AccountBadge` additionally cites data-model.md §3
as authority for the superseded claim, pointing a reader at a document that now
contradicts it.

Dangerous because these headers read as design intent. A future session
touching auth would reasonably take them as the rule.

`src/components/AccountBadge.jsx:1-12`, `src/hooks/useAuth.js:3-9`

### M8 — Totems are not actually excluded as leader-selection sources

`isSelectionSource` documents the rule and then concedes it does not implement
it:

> "The rule bars masters, totems and models without a cost. Masters have no
> cost at all, so the cost check catches **two of those three** categories on
> its own"

Totems have costs, so they pass. `toIndexedModel` already captures `totemSlug`,
and `totemSlugs(models)` exists in the same file to build the exclusion set —
**and is called from nowhere.** The machinery was built and never wired.

Whether this bites depends on whether a totem shares a keyword and sits under
the cost ceiling, which for a totem is usually true.

`src/lib/indexing.js:36-52,68-71`

---

## Low

| # | Finding | Where |
|---|---|---|
| L1 | `experienceEarned` says "Maximum three experience points from a single game"; nothing caps it and the maximum reachable is 2 (path bonus + loss). Either the comment or a missing rule. | `campaign.js:141` |
| L2 | Dead config. `VITE_REGISTRY_MODE=local` is documented in `.env.example`, exposed as `registry.mode`, and `loadLocalRegister` exists — but nothing ever reads the mode or calls the loader. `npm run seed` writes a file the app cannot use. | `api.js:2,58,118`, `.env.example` |
| L3 | Dead exports: `totemSlugs`, `useRoster.addManual`, `useRules.forget`. Indexed-but-never-read fields `keywordNames`, `secondFaction`, `hasTotem` — these persist into localStorage on every roster cache. | various |
| L4 | `rules.js` says `forgetCards` exists "for sign-out, where holding someone's text around is rude". Sign-out never calls it. | `rules.js:275` |
| L5 | CLAUDE.md §11 cites `functions/api/[[path]].js`; the file is `functions/api/v1/[[path]].js`. §11 is the section warning about that exact scoping. | `CLAUDE.md:529` |
| L6 | `activeInjuryCount` comments "counted once per titled group" but counts rows flat. Correct only while storage maintains one row per group — an invariant it relies on and does not enforce. | `campaignShape.js:190` |
| L7 | The two hire pickers disagree: Record sorts by cost and writes "5ss"; WeeklyHire is unsorted and writes "5". | `Record.jsx`, `WeeklyHire.jsx` |
| L8 | `.record` carries `break-inside: avoid`. A record longer than one page cannot honour it and may push a blank page ahead of itself. Not yet observed; the four-selection record fits. | `app.css` print block |
| L9 | Same concept, two renderings: stat lines write `Pulse 3"`, inline `{{pulse}}` renders uppercase `PULSE 2"` because `.rules__icon` is `text-transform: uppercase`. Visible together on one crew card. | `app.css`, `rules.js` |
| L10 | Two ways to total an arsenal: `Record.jsx` calls `arsenalTotal(leader.arsenal)` directly, `campaignShape` offers `totalFor` which excludes annihilated models. Harmless pre-Aftermath. | `Record.jsx:20`, `campaignShape.js:161` |

---

## Not findings

Recorded so a future audit does not re-litigate them.

- **Aftermath arithmetic is unwired.** `payday`, `aftermathHandSize`,
  `injuryFlipCount`, `AFTERMATH_PHASES`, `experienceEarned` and friends are
  referenced only by their own tests. That is the documented state (§"Written
  but not wired"), not rot.
- **`useCampaign` returns unused setters** (`earnScrip`, `setHouseRules`,
  `setCampaignField`, `reset`, `removeModel`). Same reason.
- **`src/lib` imports nothing from React.** Verified across all nine modules,
  including the three added in v0.5.0–v0.5.2.
- **`src/` and `functions/` do not import from each other.** Verified.
- **Nothing persists rules text.** `rules.js` reaches `storage.js` only for
  `downloadBlob`. No `save()` call anywhere touches a description, and the JSON
  export carries none. §4's line holds.
- **Migrations remain append-only.** One file, unmodified since it ran.

---

## Suggested order

1. **H1** — decide build-or-reword. It is user-visible and currently false.
2. **M1** — before Aftermath, not after. It is a schema problem wearing a
   component's clothes.
3. **M4, M5, M3** — the print defects. Small, isolated, and the PDF is now a
   deliverable people will actually hand round a table.
4. **M2** — small fix, real user-visible wrongness.
5. **M7** — documentation truth. Cheap, and it misleads a future session.
6. **M8** — decide whether totems should be excluded; if yes, `totemSlugs` is
   already written.
7. Lows as they are passed.

## Note on cadence

The §5 trigger fired at v0.5.0 and three sessions ran before the audit did.
Two of the mediums here (M2, M3) were introduced in that window. The trigger
worked; the response to it did not. Worth treating "audit due" as blocking the
next feature rather than as a note in the queue.

Next scheduled audit: **Session 20** (§5), or earlier if a session touches 8+
files or adds a shared module.
