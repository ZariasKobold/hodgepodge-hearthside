# Audit — v0.38.0

Date: 2026-11-09 · Session 85 (the 85th numbered entry in `VERSION_HISTORY.md`)
· 913 tests green at the start and end of this audit · `npm run build` passes ·
`npm run dialogue` passes (242 lines)

Fifth audit. **Due at entry 81, run at entry 85.** Four sessions late, and the
owner chose the order (v0.38.0's player fix first, this straight after). The
late-audit pattern from the Session 29 audit happened again: the high finding
below arrived in the last of the four sessions it was late for.

Method per §5: `CLAUDE.md` in full, then `docs/VERSION_HISTORY.md`, then the
code, then this catalogue, **written before any fix code.** It goes past `src/`
into `functions/`, because v0.37.0 changed the book route there.

**What was read, stated honestly.** `CLAUDE.md` was read in full.
`VERSION_HISTORY.md` was read in full from Session 74 on, the entries since the
last audit. Earlier entries were checked only where a finding needed them,
because the four earlier audits cover them. The code was read **by
risk, not end to end.** Every file on this audit's brief was read in full:
`lib/aftermath.js` (the v0.38.0 half), `Aftermath.jsx`,
`aftermath/PhaseAdvance.jsx`, the v0.38.0 diff to `GameLog.jsx`, `repair.js`,
`aftermathHistory.js`, `arsenalExport.js`, `shape/campaign.js`;
`lib/signature.js`, `SignatureRepair.jsx`, the signature parts of
`SelectionSlot.jsx`, `outstanding.js` and `useCampaign.setPick`; `lib/play.js`,
`hooks/usePlay.js`, `crew/PlayTab.jsx`; `functions/api/book.js`,
`functions/lib/bookStore.js` and its test, the network half of `lib/book.js`;
`shape/arsenal.js` (models, equipment, `loseModelPatch`). The sync seam these
touch was read too: `shape/migrate.js`, `shape/compare.js`, `shelf.js`,
`reconcile.js` and the load/save half of `useCampaign.js`. So was
`functions/lib/encounterStore.js` (new under `functions/` since the last audit).
The other ~60 files in `src/` (the wizard steps, crew builder screens other than
`PlayTab`, `ArsenalSheet`, `LeaderRecord`, `PhaseInjuries`, `PhaseDoctor`,
`PhaseBarter`, `rewind.js`, `rules.js`, styles) were **not** re-read line by
line. They were grepped for anything a finding here touches. A ten-session
audit of 37,000 lines that claims to have read them all would be the
measurement error CLAUDE.md warns about, so this one doesn't claim it.

**Status (v0.38.2):** H1 fixed, with the tests asked for below (mutation
checked). M1, M2 and L1–L5 open.

One conflict of interest to name: none. Nothing audited here was written by this
session.

## Status — nothing fixed yet

| Finding | Status |
|---|---|
| **H1** | Open. Needs a fix and a test; the fix direction is below. |
| **M1** | Open. One-line fix, but it is account erasure, so the owner says yes first. |
| **M2** | Open. Documentation only. |
| **L1–L5** | Open. |

Carried in from earlier audits: **nothing open in code.** Every finding of
v0.28.1, v0.21.1 and v0.11.0 is closed. v0.5.2's "nine lows still open" is not
true and has not been for some time. See M2.

---

## Verified clean

- **`pick.signature` (v0.36.0) holds its rules.** Unanswered is `null`
  (`pickSignature` reads only a boolean). Clearing an answer strips the key,
  never blanks it (`withPickSignature`). Nothing defaults it. The register's
  `is_signature` is read only by `rules.js`'s card normaliser, for crew cards,
  and never for a leader. The leader paths go through `leaderSignature` /
  `gainedSignature`. The outstanding item names the actions (`names`), as
  v0.23.0 requires. A Signature advancement outranks the player's answer.
- **`encounter.playFacts` and `play:<encounterId>` (v0.33.0).** `playFacts` is
  numbers and model ids only: VP, schemes (capped at 3), killed ids with peons
  and summons dropped, `leaderWasKilled`, an offered result. It is written once,
  at "Game over", onto the player's own encounter. `crewSummary` does not carry
  it, so a shared game never sends it. The tracker lives only in localStorage
  under `play:<id>` and is never on the campaign document. It is cleared when
  the game is logged or the crew discarded. One gap, L2.
- **The book route (v0.37.0) does what CLAUDE.md says, and nothing more.**
  `POST` only, `sameOrigin`, signed-in (`currentUser`), `requireSubject`, at
  most 200 keys bound as **one** JSON parameter through `json_each`, with
  `Cache-Control: no-store, private`. "No such table" gives an empty
  answer and anything else throws. No write endpoint exists. `sw.js` still bypasses
  `/api/` first. The text cache in `lib/book.js` is module-level and dies with
  the tab, and no book text reaches `storage.js`, `shape/` or the export.
  `book/` is outside `public/` and gitignored. "Any signed-in player" means
  anyone with a Discord account. That is the owner's stated decision (§4), not
  a finding.
- **`lostInGame` / `lostWeek` (v0.37.1).** Neither is defaulted in
  `createModel`. Undo removes both keys rather than blanking them, and only
  undoes a model with `lostInGame`. A model already annihilated is not
  re-flagged, so an injury-phase annihilation cannot be turned into an undoable
  one. No scrip moves.
- **`aftermath.late` (v0.38.0), as provenance.** `aftermathDrift` counts
  `late.taken` and `late.boxesApplied` exactly as it counts `advance`. The
  late claim writes its flag before `advanceLeader`, the audit v0.21.1 M1
  order, so a torn write under-advances and the drift item catches it.
  Withdrawal is offered only before anything is taken. A claim is offered
  only when no aftermath is open, and while one is pending it replaces the
  game log, so no game can be advanced underneath it. The routing to leader,
  totem or crew card is one `takeAdvancement`. A finished game cannot be rewound, so
  `rewind.js` not knowing `late` loses nothing.
- **`functions/lib/encounterStore.js`** keeps campaignStore's three rules.
  `requireSubject` on every export. The other crew is selected inside the SQL
  `CASE` only when both have revealed. Reveal is one guarded `UPDATE` on the
  caller's own seat. Close touches only the caller's row. What is stored is
  `sanitiseCrew`'s rebuild. Its test runs on real SQLite.
- **§6 holds.** `src/lib/` imports nothing from React. `src/` imports nothing
  from `functions/`. `functions/lib/encounterStore.test.js` imports
  `src/lib/sharedCrew.js` and two others. That is deliberate (the round-trip
  test that keeps `crewSummary` and `sanitiseCrew` agreeing), and a test is
  never bundled, so it drags nothing across.
- **§8 holds.** `LEGAL` renders in `App.jsx` (the colophon).
- **The arithmetic v0.38.0 added is right where it is reached.**
  `experienceEarned` adds one for Cruel Lessons and `maxExperienceFor` moves
  the ceiling to 4 only with the trigger. `experienceFor` will not count a
  ticked box for a leader without the trigger. The phase-four untick lock
  (`cruelLocked`) correctly holds once the box the point crossed has its
  advancement. **What is wrong is when the trigger counts as held. That is H1.**

---

## Findings

### H1 — Cruel Lessons is judged by what the leader holds now, not in that game

`lib/aftermath.js` `holdsCruelLessons(leader)`, used by `experienceFor`,
`canClaimCruelLessons`, `GameLog.jsx:68` and `Aftermath.jsx:364`.

Cruel Lessons (p. 40) earns its point in "this game's aftermath phase" for a
kill made *with the trigger*, so the leader had to hold it **during** the game.
Every check asks about the leader **as it is on screen now**. Two places that
matters:

1. **Phase four offers the point for the game in which the trigger was taken.**
   A box crossed in phase four is answered with Cruel Lessons. `onTake` writes it
   onto the leader at once (`takeAdvancement` → `advanceLeader`), so on the
   next render `holdsCruelLessons(leader)` is true and the checkbox appears in
   the same phase: "*Leader* killed the enemy leader with Cruel Lessons (+1
   experience)". Nothing is locked yet (`record.applied` is false and the point
   has crossed no box), so ticking it raises `earned` by one. That can cross
   another numbered box and grant **another advancement**, for a kill the
   leader could not have made with a trigger they did not yet have. The leader
   most likely to tick it is the one who did kill the enemy leader that night,
   which is a likely reason they flipped on the attack table in the first place.
2. **The late claim is offered on every finished game once the trigger is
   held**, including every game before it was taken and the game whose
   aftermath took it. `canClaimCruelLessons` checks the current leader, not the
   game. The confirm text says "Only if … killed the enemy leader with Cruel
   Lessons in this game", which a careful player will honour. But the app
   offers a claim it can prove is impossible, on up to every game in the
   history, each of which mints a point.

Both mint experience, and a box crossed mints an advancement. The track only
goes forward, so the mistake compounds for the rest of the campaign. A wrong
total that nobody notices is what §4 of the session rules says is worse than a
crash. It is **high** because the first route needs one tick on the screen
where the trigger is taken. `cruelLessons.test.js` doesn't catch it: it builds
a leader that already holds the trigger and never asks when it was taken.

**Fix direction.** Which game took the trigger is already in the records.
`advance.taken` / `late.taken` holds an entry named `CRUEL_LESSONS` with
`to !== 'totem'`. So:

- `canClaimCruelLessons(game, leader, games)` should allow only games played
  **after** the one whose record took it (by `playedAt`, or by order in
  `campaign.games`).
- Phase four should judge "held" from the leader **minus the entries this
  aftermath's own `advance.taken` added**, so taking the trigger tonight
  does not ask about tonight.
- `experienceFor(game, leader)` should apply the same rule, so a stray tick
  can't count either.
- If no record holds the trigger (an older row, or one added by hand), fall
  back to today's behaviour. That is the case the late claim was built for.
- Add two tests, built the way a real record is (the v0.22.4 / v0.28.1 M2
  lesson): one that takes Cruel Lessons in phase four and asserts the box is
  not offered, and one with three finished games where the trigger was taken
  in the second, asserting the claim is offered on the third only.

### M1 — "Delete my account" leaves every leader on the device

`ArsenalLibrary.jsx:255–257`.

```js
for (const key of Object.keys(localStorage)) {
  if (key.startsWith('hodgepodge:campaign')) localStorage.removeItem(key)
}
```

That prefix was the whole shelf in v2. Since the v3 cutover (v0.19.2) the
leaders live under `hodgepodge:arsenal:<id>`, `hodgepodge:arsenals:index` and
`hodgepodge:arsenals:active`, and none of them match. So erasing an account
removes the campaigns and the version and dirty bookkeeping, which share the
`campaign-` prefix. It leaves the following on the device:

- every arsenal: leader, portrait, models, scrip, injuries, advancements;
- the `v2-backup:campaign:<id>` snapshots;
- `play:<encounterId>` trackers.

They are hidden afterwards, because each is claimed (`ownerUserId`) and
`belongsTo` shows a claimed document only to its owner. But they are **not
deleted**. The code's own comment says "Nothing of theirs should survive on this
device either", and CLAUDE.md §12 says "the client clears localStorage too". On
a shared or borrowed device, that promise is the point of the button. It has
been false for 19 versions, and no test covers it, because the loop is inline in
a component.

**Fix direction:** clear by the storage module's own prefix (`hodgepodge:`).
That is everything this app ever wrote, which is what erasure means. It also
takes the Hank toggle and the register cache, both harmless to lose. Or add a
`clearAll()` to `storage.js` beside `PREFIX` and call it here, so the prefix is
stated in one place. Small, but the owner should say yes first: this is the one
button whose job is to destroy data.

### M2 — CLAUDE.md, and one audit file, state things that are no longer true

The same class as v0.21.1 M2 and v0.28.1 M7. A status claim in CLAUDE.md is a
claim about the code.

- **"Nine low audit findings, catalogued in `docs/audits/audit-v0.5.2.md`"**
  (Smaller, any time) and the audit file's own status row ("L1–L7, L9, L10
  Open"). None is open. L3 (the dead exports are gone; `indexing.js` says
  so), L4 (`useAuth` calls `forgetCards` on sign-out), L5 (§11 names
  `functions/api/v1/[[path]].js`), L7 (both pickers sort and write `ss`), L9
  (`.rules__icon` is no longer uppercased, citing "audit L9") and L10
  (`campaignShape.js` is deleted) were closed by later sessions. L1 and L6
  are moot. `experienceEarned`'s comment is now accurate, and the
  "once per titled group" comment no longer exists. L2 was already recorded as
  closed. Even the count was wrong: ten lows less L2 and L8 is eight.
- **"Every v3 arsenal passes through `createArsenal` on load
  (`migrateArsenal`)"**, the stated reason for the `arsenal.crews` rule, which
  `lostInGame` and the code comments repeat. **v3 arsenals are not lifted on
  load.** `loadArsenal` reads raw, and `migrateArsenal` runs only on an import
  (`foldIn`) and on a v2 split. The rule is still right to follow, since
  imports do pass through it, but the reason given is wrong. **Campaigns** are
  the documents that really are rebuilt on every read (`readSeated`,
  `readShelf` and `planPull` all call `migrateCampaign` → `createGame`), which
  is L1.
- **`### Audits`** says the next audit is due at entry 81.
- **§12**: "`DELETE /api/account` … the client clears localStorage too", false
  per M1.
- **The repository map** is half updated. It names `encounterStore.js` and
  the newer `src/lib/` modules. It lacks `functions/lib/bookStore.js`,
  `arsenalStore.js` and `membershipStore.js`, the routes `api/book.js`,
  `api/arsenals/`, `api/membership/` and `api/encounters/`, the hooks
  `usePlay`, `useSharedCrew`, `useMembership` and `useBook`, and
  `components/crew/`. A map that omits the files most likely to be touched next
  sends the next session to grep instead.

---

## Low

- **L1 — `game.cruelLessons` is defaulted in `createGame`, and `createGame` runs
  on every campaign read.** `migrateCampaign` rebuilds every game through it
  (`shelf.js` `readSeated` / `readShelf`, and `planPull` on the way in). So the
  first edit on a v0.38.0 device writes `cruelLessons: false` onto every past
  game and pushes it. A device still on an older build stores the same campaign
  without the key, and `reconcile` compares **raw** documents for a campaign
  conflict. Two copies that agree in everything else cannot settle themselves
  between those two builds, and the conflict screen's "other fields" will
  read `games`. `encounters: []` (v0.31.0) did the same. It is harmless once
  every device has updated, and readers already say `Boolean(game.cruelLessons)`.
  Either drop the default or record in CLAUDE.md that campaigns, unlike
  arsenals, are rebuilt on read, so a new `createGame` default lands on the
  next edit.
- **L2 — A `play:<encounterId>` tracker can be orphaned.** It is cleared only
  when the game is logged on this device or the crew is discarded from the Play
  tab. Any other route leaves it in localStorage for good: the game logged on
  another device, the campaign replaced by "take theirs", the arsenal discarded
  from the shelf (`forgetSeated`), or account erasure (M1). It holds numbers and
  ids only and is small. Sweeping `play:*` keys whose encounter is no longer
  open, on load, would close it.
- **L3 — `/api/book` has still never answered a real request.** Carried
  UNVERIFIED from v0.30.0 ("`json_each` proven only against the test fake") and
  v0.37.0 ("not tried through `wrangler pages dev` or production with a real
  session"). The 74 rows were loaded and checked by query, but the route
  itself has only run against `bookStore.test.js`'s fake. That fake answers by
  parsing the bind in JavaScript, so it would pass even if D1 rejected the
  statement. The client turns any failure into "no text", so a broken route would look
  like the feature being off. One signed-in page in production, with the
  network tab open on a leader holding one of the 74, settles it. Separately,
  keys are capped in number, not in length. That matters only to the caller's
  own request, so it is noted rather than raised.
- **L4 — The dev server serves the whole project root.** `book.js` relies on
  that to read `book/book.json` in `npm run dev`. So does anything else: the same
  server serves `docs/Index_of_the_Untold.pdf` and `book.sql` if one is lying
  around. That is only on localhost, until someone runs `vite --host` to try a
  phone on the LAN. Also, the empty `public/book.json` scaffold (680 keys, page
  numbers, no text) is still copied into every local `dist/`. Cloudflare's
  build never sees it because it is gitignored, and CLAUDE.md calls the
  location retired. Deleting the file ends both the copy and the
  `check-no-book-text.mjs` special case it needs.
- **L5 — The bundle is 543 kB, past Vite's 500 kB warning.** It is not a
  defect, and the build passes. It is listed because the warning prints on every
  build, and a warning everyone has learned to ignore hides the next one. The
  crew builder and the book text are the obvious candidates for a dynamic `import()`.

---

## Priority

1. **H1**, before Madeline next opens an aftermath with Cruel Lessons on the
   attack table, and with the two tests. It is the only finding that can make a
   campaign total wrong, and the screen that invites it is the one where the
   trigger is taken.
2. **M1**, on the owner's yes. It is a one-line change to a promise made to
   every player.
3. **M2** and **L1**, which are documentation and stop the next session acting
   on wrong facts.
4. **L3**, a two-minute check in production, not code.
5. **L2**, **L4**, **L5** when convenient.

## Note on cadence

The ten-session trigger fired at entry 81 and was set aside four times, each
time for a reason that was good on its own: a feature the owner asked for, a
model lost at the table, a reported Firefox slowdown, a player's missing
experience point. **H1 arrived in the fourth of those sessions.** It is the
argument §5 already makes, so the session-rule text needs no change. Two triggers
fired at once and the result was the same: v0.37.0 changed `functions/` (the
third trigger) at the very entry the audit was due. A rare trigger landing on an
overdue audit still didn't move it.
