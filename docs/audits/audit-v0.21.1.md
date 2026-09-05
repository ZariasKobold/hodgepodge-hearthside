# Audit — v0.21.1

Date: 2026-09-04 · Sessions 1–40 · 19,323 lines across `src/`, 3,143 across
`functions/` · 456 tests green at the start and end of this audit

Third audit. Due at Session 39, run at Session 40, after 39/39b/39c/39d/39e/39f
went by without it — the lettered-suffix habit CLAUDE.md §5 has now been
rewritten to forbid. The third §5 trigger (a new top-level module) also fired
this session for `src/lib/shape/`, and the judgment recorded in CLAUDE.md was to
run the audit **after** the v3 cutover rather than before, so the audit reads the
shape the app actually runs on. That condition is met: `campaignShape.js` is
deleted and `src/lib/shape/` is live.

Method per §5: `CLAUDE.md` and `docs/VERSION_HISTORY.md`, then `src/`, then this
catalogue — **written before any fix code**. Extended past `src/` in two places,
both deliberately:

- **`functions/`**, because the remote database is no longer only the owner's.
  Five users, six campaigns, five distinct owners, and an `active` member on the
  owner's own campaign. §5's "first non-you user" trigger has already fired.
- **`docs/Index_of_the_Untold.pdf`**, because §6's standing rule is that where a
  claim is about an external source you go and look. The three transcribed data
  files are the one place in this project where a wrong value is silent,
  permanent, and untestable — a test transcribed from the same source cannot
  catch a misreading. This audit reads them against the book.

An external prompt collection (`JeremyMorgan/Claude-Code-Reviewing-Prompts`,
CC0) was vetted and used as a checklist reference only. It is 23 markdown files
with no executable content; it assumes Express/MongoDB/JWT and was adapted
rather than followed, since following it literally would have produced findings
about middleware this project does not have.

---

## The headline: the transcription is correct

This is the result worth recording first, because it is the one that could not
be obtained any other way and the one CLAUDE.md has flagged as the concentrated
risk for three audits running.

**Every value in the three transcribed data files was checked against the book
and every one of them matches.**

| File | Checked | Result |
|---|---|---|
| `equipment.js` | 82 barter rows — name, barter rating, campaign cost, suit restriction | **All 82 match.** Exactly 6 at each value 1–13 plus 4 always-available, as the structure requires. |
| `equipment.js` | 9 relics (Those Who Thirst), and the free-choice threshold | **All match.** `9–13 Choose any of the previous entries` ↔ `THIRST_FREE_CHOICE_FROM = 9`. Omen's Mark is free-and-mandatory on either joker, `cc: 0`. |
| `injuries.js` | 28 injury rows, in order, both suits | **All match**, names and values. |
| `injuries.js` | 6 reflip conditions | **All match verbatim**, including the book's genuine asymmetry — Traitor reflips on *leader* or totem, Headstrong on *master* or totem. The code preserves the distinction rather than tidying it. |
| `injuries.js` | 14 Lucky Miss rows, 7 Back-Alley Doctor rows, the 1-scrip fee | **All match**, including Lowered Expectations' `masterOrTotem` reflip and the doctor keeping the scrip regardless of result. |
| `advancements.js` | Table sizes 60 / 63 / 74 / 30 / 15 / 7 | **All match.** |
| `advancements.js` | All 7 flip semantics | **All match verbatim.** Totem is `exact` ("corresponds **exactly** to the value"); Summoning is `choose` + `oncePerCampaign` ("there is no flipping: the choice is entirely yours… may only be selected once"); the four tier-1/2 tables are `orLower`. |
| `advancements.js` | `EXPERIENCE_TRACK` | **Correct.** See below — this one deserves its own paragraph. |

**`EXPERIENCE_TRACK` is verified, and the method matters** because CLAUDE.md
records it as having been wrong once and asks for it to be re-checked against
p.31 and the worked example on p.37. Character-column extraction is not good
enough here: the track is a graphical grid and the columns are approximate. Real
glyph coordinates were pulled from the PDF instead. Ten of the fifteen numbers
resolve to exact grid columns at a clean 35.37pt spacing across 13 columns, and
**all ten match the code**; the five the extractor could not place match as a
multiset, and the worked example on p.37 independently pins the first three
boxes as 1, 1, 2. The two unplaced row-0 digits are both `4`, so their order is
unobservable. The p.37 example also confirms 13 boxes per row and therefore 39
total, matching `EXPERIENCE_BOXES`.

One rule the book carries that the app cannot enforce is handled honestly rather
than mismodelled: the 2-scrip surcharge for adding a trigger to an action that
already has two is surfaced in `PhaseAdvance.jsx` as a `.gap-note` explaining
that the app cannot see the leader's action card. That is the correct call and
the correct mechanism — `.gap-note` shows in both Hank modes per §5.

**No finding is raised against any of the three data files.**

---

## Also verified clean

Recorded because a negative result the next session can trust is worth as much
as a finding, and because several of these are standing claims in CLAUDE.md that
had never been checked against the code.

- **The aftermath is idempotent against a reopened phase.** CLAUDE.md's standing
  warning — "barter, the doctor and the injury flips all append and would double
  on a revisit" — is **outdated**. Every phase derives its remaining work from
  the record rather than trusting a flag: `PhaseInjuries` computes `pending` by
  excluding subjects already in `flips`; `PhaseBarter` disables an item already
  in `bought`; `PhaseAdvance` excludes boxes already in `taken` and disables Done
  while one is outstanding; `PhaseDoctor` derives its list from the arsenal's
  live injuries, so a healed injury disappears. Derivation is a stronger
  guarantee than `paid` / `applied`, not a weaker one. There is also no way back:
  `PhaseRail` renders inert `<span>`s, `advance()` only moves forward, and
  `done: true` removes the game from `open`. One ordering defect survives — M1.
- **Hank's two files agree exactly.** All 241 lines in `docs/hank-dialogue.md`
  are present in `src/data/hank.js`; the only string in the code that is not in
  the doc is `HANK_TOGGLE_KEY = 'hank:enabled'`, which is a localStorage key. The
  doc's own count line (241) is correct. §5's dialogue check **passes**.
- **Authorization.** Both stores follow the three rules in `campaignStore.js`'s
  header: `userId` first, `requireSubject` throws, one ownership gate before any
  write. `putArsenal`'s `DELETE FROM arsenal_models` is additionally scoped
  through a subquery on `arsenals.user_id` — defence in depth on the exact
  statement that was the v0.7.0 hole. Both routes enforce `sameOrigin` on every
  non-GET, 401 when signed out, take `user.id` from the session and never the
  payload, and return 404 rather than 403 for another account's row so existence
  is not enumerable.
- **Sessions and OAuth.** 256-bit `crypto.getRandomValues` session ids;
  `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, 30-day expiry swept on read.
  The OAuth callback compares `state` against a cookie, upserts by
  `(provider, provider_user_id)` rather than display name, redirects to a fixed
  `/` (no open redirect), and stores no tokens. One nit — L1.
- **§4, the rules-text boundary, holds.** No `description` field appears
  anywhere in the persistence path: not in `storage.js`, `remote.js`,
  `shape/*.js`, or either server store. `sw.js` bypasses `/api/` as the first
  branch of the fetch handler, before the font branch and before any cache
  lookup.
- **§8, the disclaimer, is present.** `App.jsx:389` renders `LEGAL` in the
  colophon, and it sits **outside** the `ErrorBoundary`, so a crash cannot take
  the legal notice off the page. `PrintLegal` repeats it onto anything exported.
  It renders on the sign-in gate like every other page, satisfying §12b.
- **`planSync`'s four outcomes are correct**, conflicts genuinely refuse to pick
  a winner, and the two-kind ordering is right in both directions — campaigns
  before arsenals on push *and* pull, matching the `arsenals.campaign_id`
  foreign key that D1 actually enforces. `planSync` is called twice rather than
  taught two kinds, as `docs/sync-v3-plan.md` step 5 requires.
- **The v0.21.1 fix is really there.** Both push loops exist
  (`useSync.js:303` campaigns, `:342` arsenals).

---

## Status — H1, M1 and M2 closed in v0.22.0

| Finding | Outcome |
|---|---|
| **H1** `useSync` untested | **Fixed.** `reconcile` extracted to `src/lib/reconcile.js` as `runReconcile`, ports injected, 18 tests. Writing them found a live bug: `stripSyncFields` was skipped on the arsenal pull path, and the identical-copies auto-settle compared raw documents so it **could never fire for either kind**. Both fixed and pinned. |
| **M1** write ordering | **Fixed.** The `applied` flag is written before the advancement it guards, so a torn write under-advances rather than double-advancing. |
| **M2** stale claims | **Fixed.** All three corrected in `CLAUDE.md`. |
| **M3** silent `corrupt` | Open. |
| **L1** OAuth state cookie | Open. |
| **L2** dialogue checker | Open — written and proven at this audit, not yet committed. |
| **L3** `AFTERMATH_INJURED[0]` | Open, and the owner's to rewrite. |

One finding was **added** after the fact, from building the v0.22.0 rewind on
top of this audit: the Back-Alley Doctor's `addsInjury` outcomes are never
applied to the arsenal. Three of the seven results hand the patient a fresh
injury and `onAttempt` only spends the scrip and heals, so the ledger says
"healed, then hurt" while the arsenal records only the healing. Filed under
Known issues in `CLAUDE.md`.

---

## Findings

### H1 — The one function that broke in production is the one with no tests

`src/hooks/useSync.js` has **no test file**. There are 17 test files and 456
tests; none of them execute `reconcile`.

This is the highest-leverage gap in the project, and the argument is not
hypothetical — it is v0.21.1, three commits ago. `reconcile` was missing its
entire arsenal *push* loop because an edit script's string replace failed to
match and said nothing. The suite stayed green, because `mirrorArsenal` pushes
on every save and the end-to-end test *made* a save. The only broken path was
the one no test walked: an arsenal already dirty before the app opened — which
is adoption, and which is the state the sync pause had left every device in. It
was found by looking at production and noticing there were no arsenal documents
there.

CLAUDE.md drew the right two lessons ("assert that an edit matched", and "a green
test suite says nothing about a path no test walks") but encoded neither in a
test. `planSync` is pure and well tested with 29 cases; `reconcile` is the
imperative shell around it that decides what actually gets written, and it is
untested. The same class of silent omission will not be caught next time either.

**What would close it:** a `useSync.test.js` driving `reconcile` against a fake
`remote`/`remoteArsenals` and a fake storage, asserting at minimum that (a) a
dirty arsenal with no prior sync is pushed, (b) campaigns are pushed before
arsenals, (c) a conflict pushes nothing, and (d) one failing push does not stop
the others. (b) and (d) are both rules this project learned the hard way and
neither is currently defended by anything but a comment.

---

### M1 — `PhaseAdvance` writes in the order that fails badly

`Aftermath.jsx`, the `onDone` handler of the advance phase:

```js
if (!a.advance.applied && crossed.length) {
  actions.advanceLeader({ boxes: crossed.length, taken: [] })   // ← first
}
patch({ advance: { ...a.advance, experienceEarned: earned, applied: true } })  // ← second
```

These are two separate writes. If the first lands and the second does not, the
phase reopens with `applied` still false — but `crossed` is now recomputed from
the **new** `boxesChecked`, so it names a different set of boxes, and they are
crossed a second time. The leader silently gains experience it did not earn, and
the experience track is the one piece of leader state that cannot be recomputed
from anything else.

Every other write in the flow is guarded by derivation (see above); this one is
guarded by a flag written *after* the effect it guards.

**Fix:** swap the two statements. Writing `applied: true` first makes the
failure mode "the boxes were not crossed" — visible, and recoverable by the
player — instead of "the boxes were crossed twice", which is silent and
permanent. The narrow window cannot be closed without a transaction across two
hooks, but its consequence can be made the harmless one, and that is the whole
of the fix.

---

### M2 — The audit brief contradicts the code, and itself

CLAUDE.md is the document every future session is told to read first, so a stale
claim in it costs more than a stale claim anywhere else. Three are now wrong:

1. **M8 is closed, not open.** `## ⚠️ NEXT SESSION` says "**M8 is still open**,
   and this file claimed for eight versions that it was not: totems are named in
   the legality message and not excluded by the check." `isSelectionSource` in
   `src/lib/indexing.js` excludes them by name — `!isTotem(model)` — and has
   since v0.16.0. The shipped-features table in the same file says so correctly
   ("`isSelectionSource` excludes them by name"). **CLAUDE.md contradicts itself
   about M8 in two places.** M8's original premise ("totems have costs, so they
   pass") was itself disproven later by fetching the register.
2. **L2 is closed.** "`VITE_REGISTRY_MODE=local` is documented in `.env.example`
   and wired to nothing, so `npm run seed` writes a file the app cannot read."
   `api.js` exports `loadLocalRegister`, which reads `/register.json`;
   `seed.mjs` writes `public/register.json`; `useRoster.js:51` calls it. The
   code comment even cites "audit L2" as fixed.
3. **The aftermath idempotency warning** is outdated, as recorded above.

The pattern is the one this project keeps rediscovering: a claim about the code
written once and then trusted for versions. §6 already says "if you find
yourself reasoning about what the register returns, fetch it instead." The same
rule wants extending to this file — **a status claim in CLAUDE.md is a claim
about the code, and it should be checked against the code, not carried
forward.**

---

### M3 — `corrupt` is computed, then silently discarded

Both stores detect a row whose `doc` will not parse and flag it:

```js
// A row we cannot parse is worse than useless in a merge — report it as
// corrupt so the local copy wins rather than silently replacing good data.
return { id: row.id, ..., corrupt: true }
```

Nothing ever reports it. `planSync` filters corrupt rows out of `remoteById`
entirely (`remote.js:236`), `shelf.js:296` strips the flag off the document, and
no status line, count, or message anywhere in `src/` mentions it. The comment
describes an intention the code does not carry out.

Two consequences, in order of how much they matter:

- **The user is never told.** A corrupt row is indistinguishable from an arsenal
  the account does not have. That is the exact class of silence this project has
  been burned by twice — the v0.18.4 clock bug and the v0.19.3 white screen were
  both invisible while happening.
- **On a device with no local copy it is unrecoverable.** Filtering it from
  `remoteById` removes it from the pull path too, and a version can only be
  learned from a pull or an accepted push (the listing deliberately stopped
  recording versions after the portrait incident). So the row can never be
  pulled and never be pushed over. On a device that *does* hold the arsenal it
  takes the adoption path and heals itself if the versions line up — the
  documented intent — so this is narrow, but it is the same deadlock shape as
  the projection-only row fixed in v0.21.0, and like that one it will not clear
  on its own.

Reachability is genuinely low: writes go through `JSON.stringify`, so it takes
corruption at the storage layer. The cheap half of the fix is worth doing
regardless — surface the count in the shelf's status line, so a corrupt row is a
thing somebody can see.

---

### L1 — The OAuth state cookie outlives its use

`completeOAuth` compares `state` against `STATE_COOKIE` and then never clears it,
so it stays valid for its full 600-second `Max-Age`. Replay is already blocked
by the authorization code being single-use at the provider, so this is
defence-in-depth only. Clearing the cookie in the same response that sets the
session cookie costs one line.

### L2 — The dialogue counter script still does not exist

§1 says the fix for the dual-file rule becoming tiresome is "a generator script
in `scripts/` that writes the markdown from the code", and §5's dialogue check
depends on whoever runs it inventing a correct regex. The v0.5.2 audit's M6 was
a false positive for exactly that reason.

This audit wrote a working checker, and the trap is real and worth recording:
the doc's codes are **alphanumeric** (`H1-01` alongside `S-04`, `BA-07`,
`C-01 · Identity`), so the obvious `^\*\*[A-Z]{1,3}-` pattern silently drops six
entries and finds drift that is not there. Two further traps: the repo is CRLF,
so a `"$` anchor never matches; and the strings in `hank.js` **include their own
surrounding quote marks**, so both sides must be stripped before comparing. A
checker that gets any of the three wrong reports 241 false mismatches — this one
did, twice, before it was right.

A committed script would retire the manual half of §1. It is a small piece of
work with a permanent payoff, and the correct implementation is now known.

### L3 — `AFTERMATH_INJURED[0]` is still filed under the wrong moment

Carried forward unchanged from CLAUDE.md. The line opens "Well howdy again
friend, it's been a hot minute… Anyway, how'd things go?" — an *arrival* line
firing at the injury flip, after the player has already described the game. A §2
timing violation living in the data rather than the code. Left for the owner:
it is their voice to rewrite, and any change is a dual-file change under §1.

---

## Priority

1. **H1** — write `useSync.test.js`. It is the only finding here that defends
   against a repeat of the bug that shipped three commits ago.
2. **M1** — swap two statements in `Aftermath.jsx`. Smallest fix, worst averted
   outcome.
3. **M2** — correct the three stale claims in CLAUDE.md. Free, and it stops the
   next session acting on them.
4. **M3** — surface the corrupt count in the shelf status line.
5. **L2** — commit the dialogue checker.
6. **L1**, then **L3** at the owner's convenience.

## Note on cadence

Both previous audits closed with a note that "audit due" should block the next
feature rather than join the queue. Both notes were then ignored — v0.5.2's by
three sessions, v0.11.0's by nine, and this one by six. §5 has now been
rewritten twice in response: once to count sessions rather than versions, and
once (this session) to forbid lettered suffixes, which is the specific mechanism
that hid the counter this time.

Worth observing that the rewrite is not what fixed it. What fixed it was the
third trigger firing on a new top-level module — a trigger that is rare enough
to mean something when it fires. The two triggers that fire often have been
ignored every time; the one that fires rarely was obeyed immediately. That is an
argument for keeping §5's trigger list short and its wording narrow, and against
adding any further trigger that would fire on an ordinary feature session.
