# Audit — v0.28.1

Date: 2026-09-30 · Session 71 (the 71st numbered entry in `VERSION_HISTORY.md`)
· 697 tests green at the start and end of this audit

Fourth audit. **Due at entry 64, run at entry 71** — late by seven sessions, and
for a reason worth reading before anything else (M4).

Method per §5: `CLAUDE.md` and `docs/VERSION_HISTORY.md` in full, then the code,
then this catalogue — **written before any fix code.** Extended past `src/` into
`functions/`, because a change under `functions/` is one of §5's triggers and it
fired at v0.28.0.

**What was read, stated honestly.** Every file changed since the last audit
(`git diff 3fefa08 HEAD`: 51 files, +6,214 lines) was read in full. Files
unchanged since the v0.21.1 audit — which read them in full — were skimmed for
anything this audit's findings touch, not re-read line by line. The book was
opened where a claim was about the book (§6).

One conflict of interest to name: `membershipStore.js`, `useMembership.js`,
`Players.jsx` and `lib/membership.js` were changed in the two sessions
immediately before this one, by the same author as this audit. They were
re-read with that in mind and nothing is raised against them, but a
self-review is weaker evidence than the rest of this document.

## Status — every finding closed, v0.30.0 (Session 74)

| Finding | Status |
|---|---|
| **H1** | Fixed v0.29.0 — `settleMirrored`. |
| **H2** | Owner decision, v0.30.0: the claim corrected in §4, `bookStore.js`, `book.js`; plausibility check and a 40-key daily allowance (`book_served`, 0009). Friction, not proof, and now described as such. |
| **M1** | Fixed — `boughtCount` / `purchaseReady`. Repeats allowed (p. 21); a double-click is one purchase. |
| **M2** | Fixed — derived from `phasesFor`; the fixture is built as a real record is. |
| **M3** | Fixed — equipment annihilated by flag; drift trap tested. The Traitor half was already right (v0.29.2). |
| **M4** | Fixed v0.28.2 — §5 counts by ordinal. |
| **M5** | Fixed — code and player-facing copy state what is known, not a cause. |
| **M6** | Fixed — corrupt ids counted and shown on the shelf. |
| **M7** | Fixed — CLAUDE.md corrected. |
| **L1** | Fixed — state cookie cleared after it is checked. |
| **L2** | Fixed — `npm run dialogue`. |
| **L3** | Fixed by owner decision — I-01 → S-13; new I-03. |
| **L4** | Fixed — an import starts a reconcile. |
| **L5** | Fixed — injury keys by printed name on all three ends. |
| **L6** | Fixed — empty answers where the tables are missing. |
| **L7** | Fixed from the book (p. 19) — `fateTakesBack`; `leader.annihilatedWeek`. |
| **L8** | Fixed from the book (p. 33) — the healed injury is not a duplicate. |
| **L9** | Fixed. |

---

## Verified clean

- **Every newly transcribed number matches the book.** Since the last audit,
  `data/advancements.js` gained `statFrom` / `statTo` / `needsResist` on the five
  Skill Boost rows and `signature: true` on the two Signature rows. Read against
  pp. 39–43: attack Skl 4→5, 5→6, 6→7, each "with a resist of Df or Wp"; tactical
  0/1→2 and 2/3→4 with no resist condition; both Signatures "this action becomes
  a signature action". **All seven match.** No finding against the data files.
- **Hank's two files still agree.** Neither `src/data/hank.js` nor
  `docs/hank-dialogue.md` has changed since the v0.21.1 audit measured them at
  241 of 241. §5's dialogue check passes by inheritance.
- **§4 holds.** Book text lives only in `lib/book.js`'s module cache; no
  `description` or book text reaches `storage.js`, `shape/`, `remote.js` or the
  JSON export. `sw.js` still bypasses `/api/` first.
- **§6 holds.** `src/lib/` imports nothing from React; `src/` and `functions/`
  import nothing from each other.
- **§8 holds.** `LEGAL` renders at `App.jsx:449`, outside the `ErrorBoundary`
  (319–447).
- **The rest of the aftermath's double-click behaviour is safe.** `PhaseAdvance`
  resets its draft after `commit`, and `current` moves on, so a second click
  finds nothing ready. Payday is guarded by `paid`. The barter screen is the
  exception — M1.

---

## Findings

### H1 — The save-time push clears the unsent flag without checking the disk

`useSync.js`, `mirror` (line 187) and `mirrorArsenal` (line 278).

v0.24.0 found that a push which completes after the player has edited again
must not mark the document clean, and fixed it with `settleAfterPush` — **in
`reconcile.js` only.** The two functions that push on *every save* still do this
on success:

```js
rememberVersion(arsenal.id, saved?.version)
markDirty(arsenal.id, false)          // ← whatever is on the disk now
```

`useCampaign` saves and mirrors on every state change, with no debounce, so any
burst of edits faster than one network round trip overlaps. Typing a leader's
name is the ordinary case. The sequence is deterministic:

1. Save "A" → dirty → PUT A with base *v*.
2. Save "AB" → dirty → PUT AB with base *v* (A's reply has not arrived).
3. A's reply: server now *v+1*; this device records *v+1* and marks the
   arsenal **clean** — while "AB" is on the disk and unsent.
4. AB's PUT is refused, 409, because its base was *v*. The 409 path starts a
   reconcile. `planSync` sees: clean, base *v+1*, server *v+1* — **nothing to
   do.**

"AB" never reaches the account, and nothing says so. It is pushed only when the
player next edits that document. If they never do on this device, and edit on
another, this device's next reconcile sees clean-and-behind and **pulls over
"AB"**. That is silent loss, and it is the exact failure v0.24.0 wrote
`settleAfterPush` to prevent, sitting in the path that runs most often.

Reasoned from the code rather than reproduced in a browser. The steps are
unconditional, so the only open question is how often replies overlap on a
real connection, not whether the damage happens when they do.

**Fix direction:** route `mirror` / `mirrorArsenal` success through the same
compare-before-settle `settleAfterPush` uses (clear dirty only if the disk still
equals what was sent), and consider debouncing the mirror, which would also end
the 409 storm a burst of keystrokes produces now. Add a test in the
`reconcile.test.js` style.

### H2 — The book-text entitlement trusts a document the client wrote

`functions/lib/bookStore.js`, `getBookText` / `entitledKeys`.

The whole defence of §4's earned-text exception is the sentence *"collecting the
book requires earning every advancement and buying every item across many real
campaign weeks, which is not a scrape."* The code does not support it.
`entitledKeys` reads `arsenals.doc`, and **`arsenals.doc` is whatever the
caller last PUT to `/api/arsenals`.** Earning happens entirely on the client;
the server has no independent record of a flip, a purchase or an advancement.

So a signed-in user can PUT one arsenal whose `leader.advancements` lists every
row and whose `equipment` lists every item. Every name, value and id needed is
published in this repository (`data/advancements.js`, `data/equipment.js`,
`scripts/book-template.mjs`). Then one POST to `/api/book` asking for all keys
returns the whole book, capped at 200 keys per request, so two requests.

What is left of the gate is `book_access`. That is one question with a small
answer space, eight attempts, then one every 15 minutes (the lockout re-arms on
each failure beyond eight), and a fresh budget per Discord account. That slows
a determined person down by an afternoon. It does not stop them.

**Not live.** Migrations 0007/0008 are not applied to remote and no text has
been loaded, so nothing can leak today. **This finding blocks loading the
text**, and it is the owner's decision, not a code fix, because the property the
design claimed cannot be built without the server witnessing play:

- accept it, and correct the claim in §4, `bookStore.js` and `book.js` to what
  is true: *signed in, has answered a question, and claims to hold the entry*;
- add friction that does not depend on trusting the document, such as a per-user
  cap on distinct keys served per day, or refusing entitlement to an arsenal
  whose `doc` holds more advancements than its experience track can have paid
  for (39 boxes, 15 numbered);
- or keep the text out of D1 after all.

### M1 — The barter counter's "Bought" guard has been dead since v0.22.0

`PhaseBarter.jsx:104`: `const owned = bought.includes(e.id)`.

Since v0.22.0 `bought` holds objects (`{ rowId, equipmentId, name, cc }`), so an
id string is never found. The button never reads "Bought" and never disables,
and a **double-click buys twice and charges twice.** The v0.21.1 audit listed
"bought items are disabled" as part of why the aftermath is idempotent. It was
true then and stopped being true in the next release.

The book does not forbid buying the same item twice ("it may immediately
purchase any equipment with a barter rating exactly equal…", p. 21), so whether
duplicates should be *blocked* is the owner's call. Either way the counter
should say what has been bought, and a double-click should not be a purchase.

### M2 — A forfeited phase is never shown as forfeited

`aftermathHistory.js:136` reads `record.skippedPhases`. **Nothing writes it.**
Skipping is derived by `phasesFor(game)` and never stored. So the history of an
early-withdrawal game shows its five forfeited phases as "Nothing recorded",
the ambiguity v0.24.0 built the view to remove. CLAUDE.md says "Skipped ≠
empty, and a forfeited phase says so." In real data it cannot.

`aftermathHistory.test.js:149` passes because its fixture carries
`skippedPhases`, a field no real record has. This is the fourth time in this
history that a fixture has agreed with the mistake (v0.22.4, v0.24.0, v0.25.0).
Fix: derive from `phasesFor(game)`, and build the test fixture from
`createAftermath` + `createGame` the way a real one is made.

### M3 — Nothing can ever leave an arsenal

Three rules remove things from an arsenal, and the app implements none of them:

- **Traitor** (black joker on the injury chart): "this model leaves your
  arsenal and joins the opposing crew's". `PhaseInjuries` says so in a note and
  the model stays.
- **Equipment that annihilates itself**, for example Lucky Gremlin Foot, "it
  may annihilate this equipment to not do so" (p. 22). It stays on the arsenal
  for ever.
- `removeModel`, `removeEquipment` and `removeGame` exist in `useCampaign` and
  are **passed to nothing**. So a player cannot even do it by hand.

The arsenal total, and with it the encounter cap and the shared page, stay wrong
for the rest of the campaign.

**A trap for whoever fixes it:** `aftermathDrift` treats any bought `rowId` the
arsenal no longer holds as *lost*, and `RepairAftermath` would offer to put it
back **and charge for it again.** Removing equipment legitimately must leave a
trace the detector honours (a `removedAt` flag, like injuries, rather than
deletion), or the first annihilated Gremlin Foot becomes a false positive that
moves somebody's scrip. That is the failure CLAUDE.md names as the one the
repair must never have.

### M4 — The session counter broke again, worse than last time

§5 counts audits by the numbered entries in `VERSION_HISTORY.md`, and was
rewritten at Session 40 to forbid lettered suffixes, because six sessions all
called "39" had hidden an audit. The history now contains **two entries numbered
40 and three each numbered 41 to 47.** Numbering restarted twice, at v0.22.0
and again at v0.23.0, and the two sessions before this one (labelled 48 and 49)
continued the wrong sequence.

By ordinal count there are 70 entries. The last audit is entry 54, so it was
due at 64, and the entry that ordered it said "Session 50", which by its own
labels was still in the future. The mechanism is new and specific. Each session
numbered itself from the **last number it saw**, not by counting, and one
reused number made every later label wrong.

**Recommendation:** do not renumber history; other entries cite these
numbers. Record in §5 that the count is the **ordinal** of `### Session`
headings (`grep -c '^### Session' docs/VERSION_HISTORY.md`), label from here by
that count, and put the next audit due at **entry 81**.

### M5 — The retracted Gatling Gun story is still told as fact, including to players

v0.24.1 retracted the "lost update" as a measurement error. `CLAUDE.md` was
corrected. The code was not:

- `reconcile.js:28–42` says the race "reached production on 2026-09-08" and a
  player "lost a Gatling Gun, three advancements and three experience boxes".
- `repair.js:4–8` says "one arsenal on the database is still missing" them.
- `outstanding.js:28–32` repeats it as "It is not hypothetical."
- **`RepairAftermath.jsx:47–52` is user-facing.** If the panel ever shows, it
  tells the player *"A sync bug that has since been fixed overwrote this leader
  with an older copy of itself."* CLAUDE.md says that if the detector ever fires
  on a real arsenal, "that is a bug in the detector and not a discovery". So the
  copy would tell somebody a false cause in the one situation it appears.
  `outstanding.js`'s detail text ("None of it is on the arsenal") has the same
  footing.

The code comments are the easy half. The copy is the half that matters: it
should say what is known, that the game record and the arsenal disagree, and
not a cause that was ruled out.

### M6 — `corrupt` is still computed and discarded (carried: v0.21.1 M3)

Unchanged. `planSync` drops corrupt rows from `remoteById`, and nothing anywhere
counts or shows them.

### M7 — CLAUDE.md's status block contradicts itself again

The v0.21.1 audit's M2 was this, and the recommendation then was that a status
claim in CLAUDE.md is a claim about the code. Current contradictions:

- `### Where things stand — v0.22.2` heads the status block, six minor versions
  stale, with "673 tests" under it (697), and §10 says "570 tests".
- The shipped-features table still says **"⚠ Sync is off"** on the v3 row, and
  the conflict section says "still unexercised against a real conflict,
  **because sync is off**". Sync has been on since v0.21.0.
- `### Audits` says of v0.21.1's findings "none is closed yet". H1, M1 and M2
  were closed in v0.22.0, as the status table eight lines further down that
  same audit file says.

---

## Low

- **L1 (carried)** — the OAuth state cookie is never cleared
  (`auth.js:108/121`).
- **L2 (carried)** — the dialogue checker is still not committed. `scripts/`
  has no counter; the three traps are recorded in the v0.21.1 audit.
- **L3 (carried)** — `AFTERMATH_INJURED[0]` ("Well howdy again friend, it's been
  a hot minute…") is still an arrival line firing at the injury flip. The
  owner's to rewrite.
- **L4** — an imported leader is not sent to the account until the next page
  load. `adopt` saves and marks dirty but mirrors nothing, and `reconcile` runs
  once per sign-in.
- **L5** — book text for injuries can never be shown. The scaffold keys injuries
  by the data table's row id (`book-template.mjs:75`), the server entitles by
  `injury.injuryId ?? injury.id` (the arsenal row's random `inj_…`), and no
  component passes `injuryId` to `BookText`. Dormant; the three ends need to
  agree before injuries get text.
- **L6** — production is running code whose tables do not exist. Every
  signed-in page load POSTs `/api/book` twice or more (the gate, the record) and
  gets a 500 until 0007/0008 are applied. The client treats that as "no text",
  so nothing breaks, but it is noise in the logs and should not outlive the
  migration.
- **L7** — the second annihilation of a leader is recorded nowhere on the
  arsenal. A note says "retire this crew" (p. 37) and the arsenal carries on as
  playable. Separately, Miraculous Recovery drops the third injury only when a
  phase-6 flip attached it. A third injury from Dr. Mo, which v0.22.6 made
  possible, is not dropped. **Needs the book open before changing**, to confirm
  what "retire" requires of the app.
- **L8** — Dr. Mo's follow-up injury flip counts the injury he just healed as a
  duplicate and throws it back. The heal happens first, so gaining the same
  injury again may be legal. A rules question for the book, not a code bug
  until answered.
- **L9** — stale comments: `useSync.js:244` ("Pushing is off, so 'keep mine'
  simply keeps it"), `useSync.js:204` ("`planSync` compares `updatedAt`"),
  `remote.js:170–187` (a v0.7.0 doc block, "newer `updatedAt` wins", stacked
  above the current one), `book.js:93` ("for a year").

---

## Priority

1. **H1**, before the next game night. It is the only finding that can lose
   work silently today, it is in the path that runs on every keystroke, and the
   fix is a pattern this codebase already wrote and tested.
2. **H2**, an owner decision, and it **blocks loading any book text**.
3. **M1** — a scrip total wrong by a double-click.
4. **M5**, the player-facing half first. **M3** — and read its trap before
   starting.
5. **M2**, **M4** and **M7**, which are cheap and stop the next session acting on
   wrong facts.
6. **M6**, then the lows.

## Note on cadence

The v0.21.1 audit observed that the rare trigger ("a new top-level module, a
change under `functions/`") was obeyed and the frequent ones were not. That held
again: the `functions/` trigger fired at v0.28.0 and this audit followed within
two sessions, while the ten-session trigger had silently lapsed. It lapsed
because the counter it depends on was wrong (M4), not because it was ignored.
A trigger is only as good as the number it reads. Making the count mechanical
is the fix, not another rewrite of the wording.
