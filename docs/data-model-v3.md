# Splitting arsenals from campaigns — the plan for `schemaVersion: 3`

Status: **steps 1, 2 and 3 done; 4 and 5 outstanding.** Written 2026-09-01 at
v0.18.5; step 1 landed 2026-09-02 at v0.19.0, steps 2 and 3 on 2026-09-03 at
v0.19.2.

⚠ **Sync is switched off** (`SYNC_DISABLED` in `src/hooks/useSync.js`) and must
stay off until step 5. The server still holds v2 documents; one push of a v3
campaign would overwrite a player's copy with a campaign that has no arsenal in
it. See `CLAUDE.md`.

The shape lives in `src/lib/shape/` — `arsenal.js`, `campaign.js`,
`ownership.js` and `migrate.js` — with `src/lib/shelf.js` as the seam between it
and storage. **This is what the app runs on.** `src/lib/campaignShape.js` was
deleted at the cutover, as this plan said it would be.

**Step 2 passed on real data, 2026-09-03.** The lift was run against all six live
campaigns pulled out of remote D1 and lost nothing; both ids were preserved on
every one. The backup that made it possible is in `backups/` (gitignored — it
contains live session cookies). Step 3, the UI cutover, is unblocked.

Read `docs/data-model.md` first — it is the original design and this supersedes
part of it. Read `## 12` and `## 12b` of `CLAUDE.md` too; several rules there
are written in terms of the shape this document changes, and they will need
rewording alongside the code.

---

## The problem, stated as evidence rather than taste

Today one campaign holds one leader, and a second leader of your own is a second
campaign. That was a reasonable simplification when there was one player. With
real players on the database it has started producing shapes that are hard to
defend:

- **Six campaign rows across five users**, most of them a single leader that
  nobody would call a campaign.
- **`campaigns.member_of` is a campaign row pointing at another campaign row.**
  That column exists because a player's "campaign" has to be attached to the
  host's "campaign", which is only necessary because both things are called the
  same thing.
- On 2026-09-01 a member was `active` on the owner's campaign while `member_of`
  was `null` on both of their own campaigns. Nothing was broken; the link is
  simply a separate step that exists only because of the conflation.
- **`arsenals[]` inside a campaign is for other players**, and `CLAUDE.md` has to
  warn a reader not to put their own second leader in it. A field that needs a
  warning label is the design telling you something.

The player's own words for it, which are the clearest statement of the target:

> Players build leaders/arsenals and then can choose to associate them with the
> campaign. The campaign should be mostly about the multiplayer aspect; who is
> involved, what leader/arsenal from their personal list did they choose to
> participate, passing data back into the leader/arsenal object as aftermath and
> upgrades happen.

## The encouraging part: D1 already believes this

The relational schema was designed correctly and the document drifted away from
it. `arsenals` has been its own table since migration 0001, with **both**
`campaign_id` and `user_id`, and since 0003 it carries `injuries`, `equipment`
and `totem` as well. `games` has its own table keyed by `campaign_id`.

So this is not a schema redesign so much as **moving the client document toward
the schema that is already underneath it**. That is a much smaller claim than it
first sounds, and it is the strongest argument for doing it.

---

## Target model

Three concepts, and the discipline is in keeping them three.

### Arsenal — the durable personal object

Everything the book's arsenal sheet holds: the leader (name, archetype,
characteristics, size, base, advancement path, portrait, picks, trigger),
the models, scrip, injuries, equipment, the experience track, advancements, and
the totem if one was earned.

Owned by exactly one user. **Exists before, and independently of, any campaign.**
It is what the shelf lists, and what a player thinks of as "my Cletus".

### Campaign — the table

Weeks total, start date, week mode and offset, house rules, and the participants.
Nothing personal lives here. A campaign is a thing several people are in.

### Participation — the join

`(campaign, user, arsenal)`, plus that player's nickname and `share_identity`.
This is what `campaign_members` already is, gaining an `arsenal_id`.

Games live on the campaign. Aftermath is a campaign event that **writes into the
arsenal**, which is exactly the direction the player described and exactly what
the book does: injuries, equipment, scrip and advancements persist with the
leader, weeks and games belong to the table.

### One decision this forces

**An arsenal may belong to at most one campaign at a time.** Recommended, and
worth defending in the code comment rather than only here.

The book's scrip, week count and experience are per-campaign quantities. A
leader in two campaigns at once has two contradictory histories and the arsenal
sheet cannot print either. Allowing it would mean either splitting the arsenal
again into "identity" and "play state", or snapshotting a copy per campaign —
both real designs, both more machinery than this app needs.

So: an arsenal has `campaignId`, `null` until it joins. Wanting the same leader
in a new campaign is **"start a fresh campaign with a copy of this arsenal"** — a
duplicate with its own history, which is honest about what it is.

---

## What this retires

| Retired | Replaced by |
|---|---|
| `campaign.arsenals[]` | arsenals are top-level; the campaign lists participations |
| `campaign.localArsenalId` | the arsenal *is* the object you have open |
| `campaign.members[]` | `campaign_members`, which already exists |
| `campaigns.member_of` | `campaign_members.arsenal_id` |
| "your second leader is a second campaign" | a second arsenal on the shelf |
| `join_code` (unused since 0001) | delete it at last |

`min(both arsenals) + 6` for encounter size stops being a lookup into a nested
array and becomes a read across the campaign's participations, which is what it
always wanted to be.

---

## Storage keys

Local, mirroring the split:

```
arsenals:index      → [arsenalId]
arsenal:<id>        → the arsenal document
arsenals:active     → the open arsenal
campaigns:index     → [campaignId]
campaign:<id>       → the campaign document
```

`campaigns:active` stays, because a campaign can be open too — but opening an
arsenal and opening a campaign become different actions, which is the whole
point and will need the five-view rule in §12b rewritten.

---

## The part that will actually cost you: sync

This is the real risk and it should be planned for explicitly, not discovered.

**There are now two kinds of synced object, and every piece of v0.18.5's
machinery is written for one.** `campaign-version:<id>`, `campaign-dirty:<id>`,
`planSync`, `putCampaign`'s version gate, `useSync`'s pull/push loops — all of it
assumes "campaign" is the unit that syncs.

Do **not** copy-paste that machinery for arsenals. Generalise it once:

- `knownVersion(kind, id)` / `markDirty(kind, id)` — keys become
  `sync-version:<kind>:<id>`.
- `planSync(localsByKind, remotesByKind, facts)` returning per-kind plans, or
  called once per kind with the same pure logic.
- The server keeps one version column per synced table. `arsenals` already has
  `updated_at`; it needs `version` the same way `campaigns` got one in 0004.

**A conflict on an arsenal is more likely than a conflict on a campaign**, since
the arsenal is the thing that changes every week. The v0.18.5 rule holds and gets
more important: report it, change nothing, let a person settle it. Which means
the "keep mine / take theirs" screen, currently listed as a High known issue,
should probably ship **before** this work rather than after.

---

## Order of work

Build it in this order, and do not skip step 1 or reorder 4 and 5.

1. ~~**The pure shape first.**~~ **Done, v0.19.0.** `src/lib/shape/arsenal.js`,
   `campaign.js`, `ownership.js`, `migrate.js`; 93 tests. `createArsenal`,
   `createCampaign`, `createParticipation`, `splitLegacyCampaign`, `belongsTo`,
   `encounterCapFor`, and the export/import trio `bundle` / `readBundle` /
   `refileForImport`. This is §6, and it is the reason the campaign arithmetic
   was debuggable when a scrip total was disputed.

2. ~~**`migrate` v2 → v3, locally, both directions in mind.**~~ **Done and run
   for real, 2026-09-03.** `migrate-check` passed against all six live campaigns
   pulled from remote D1 — nothing lost, both ids preserved on every one. Each
   existing campaign splits into one arsenal plus one campaign, with a
   participation joining them. The arsenal keeps the *existing* `ars_…` id — it already has
   one, and reusing it means the D1 `arsenals` rows line up rather than
   orphaning.

   `migrateLeaderToCampaign` has never been run against anything but a synthetic
   record (`CLAUDE.md`, "Never verified"). Do not add a second unverified lift on
   top of it. Run v3's migration against **real exported JSON from the live
   account** before trusting it.

   **The tool for that now exists**: `node scripts/migrate-check.mjs <export.json>`.
   It reads only — no writes, no network, no browser storage — and per campaign
   asserts conservation: models, injuries, equipment, scrip, experience boxes,
   advancements and games all still present, every model carrying an id, every
   arsenal seated at the table it came out of, and **both ids unchanged**. It
   exits non-zero if anything broke. Point it at the real export before step 3;
   that run is the difference between a tested lift and a trusted one.

3. ~~**The UI, against local storage only**, with sync switched off.~~ **Done,
   v0.19.2.** Still outstanding: a real week on the **new** shape. The real game
   this plan's last two sections came from (Mads v Dalton, 2026-09-02) was played
   on v2, before the cutover — so v3 has been exercised by a browser, not by an
   evening. The shape is wrong in some way nobody can predict from here, and finding
   that out before a schema is on the remote database is the entire lesson of
   `## 12b`'s "build order matters".

4. **Migration 0005 — and 0006.** `docs/sync-v3-plan.md` is the full design for
   steps 4 and 5; what follows is the sketch it grew out of. The one thing that
   sketch missed: `arsenals.campaign_id` is `NOT NULL` **and `ON DELETE
   CASCADE`**, so a deleted campaign takes its arsenals with it — the opposite of
   open question 3. SQLite cannot change either without a table rebuild, which is
   0006.

   Once the local shape has survived a real week:
   `ALTER TABLE arsenals ADD COLUMN version INTEGER NOT NULL DEFAULT 0;`
   `ALTER TABLE campaign_members ADD COLUMN arsenal_id TEXT REFERENCES arsenals(id);`
   plus `arsenals.campaign_id` becoming nullable if SQLite will allow it — and if
   it will not, that is a table rebuild and a much bigger conversation.
   Append-only: never edit 0001–0004.

5. **Generalise sync last.** It is the piece that can destroy somebody's twelve
   weeks, and it should be written against a shape that has already stopped
   moving.

---

## Non-negotiables to carry through

These are not new; they are the ones this change is most likely to break by
accident.

- **Every campaign and every arsenal must export to JSON**, and an import must
  still file a new object rather than overwrite one (§8, §12b). The export is the
  only thing that makes any of this survivable, and it is the safety net for the
  migration itself.
- **`doc` stays the source of truth; the normalized columns stay a projection.**
  Splitting the document does not make the columns authoritative. The one place
  that changes is the shared page, which reads columns deliberately — see the
  privacy note on the `arsenals` INSERT in `campaignStore.js`.
- **User ids still do not cross.** The shared view gains an arsenal that is more
  clearly somebody else's; `publicMember` remains the single function that
  decides what leaves.
- **No rules text anywhere that persists** (§4). An arsenal is a persisting
  object, so it travels the lossy `toIndexedModel` path like everything else.
- **Two gates for membership.** Redeem → `pending`, host admits → `active`. The
  arsenal link is a third thing a player chooses and must not become a way to
  join without being admitted.

---

## Open questions — settled 2026-09-02, and where each one lives

1. **Does a solo player have a campaign at all?** Yes: an implicit campaign of
   one, created silently. `createCampaign` starts with **no** participants at
   all and gains one when an arsenal is seated, so soloing and a table of five
   are the same code path and there is no special case to rot.

2. **Who owns the week?** The **campaign** owns the week — a group agrees when
   week four is, and two players disagreeing about it is the bug. What is
   per-player is `participation.joinedWeek`, read by
   `mustHireThisWeek(arsenal, week, { joinedWeek })`. An arsenal that arrived in
   week four is not delinquent for weeks two and three, and telling its owner it
   owes three hires would be the app being confidently wrong about weeks the
   player was not present for. Defaults to 1, which is the book's assumption
   that everybody starts together.

3. **What happens to an arsenal when its campaign is deleted?** It survives with
   `campaignId: null` and its history intact. `leaveCampaignPatch` is the whole
   of it, and it is deliberately a patch on the arsenal rather than a cascade on
   the campaign — the two documents are two writes and a function pretending
   otherwise would be pretending to a transaction it cannot have.

4. **Can a host see a member's arsenal before admitting them?** No, and it is
   asserted in `campaign.test.js`. `visibleArsenalIds` runs the rule both ways:
   a pending player sees their own arsenal and nothing else, and a stranger sees
   nothing at all.

### One thing the migration deliberately does not do

**Several v2 campaigns belonging to one person are not merged into one campaign**
— even though "six campaign rows for five users" is the mess that motivated
this. Merging means guessing that two leaders played at the same table, and
reconciling two week counts, two start dates and two sets of house rules by
picking a winner. That is the shape of every bug this project has had. Each v2
campaign becomes one campaign and one arsenal, faithfully; moving an arsenal to
another table afterwards is a deliberate act by a person who knows whether it
belongs there.

### The trap that step 1 found on its own

`readBundle` originally decided "is this a bundle?" by looking for an `arsenals`
array — and **a v2 campaign is also an object with an `arsenals` array**. Reading
one as a bundle discarded the campaign and filed the arsenals that had been
nested inside it as though they were top-level. Silent loss, on the one path that
exists to prevent loss. Caught by its own test; the fix is that the bundle test
is narrow (`format`, or a `campaigns` array) and the campaign test is checked
first. Worth remembering, because the two shapes overlap on exactly one field
name and the next person to touch that function will meet it again.

---

## The crew builder, and what it is really for

Added 2026-09-02, after the first real game played with this app. The owner's
words:

> There was no way to easily have your whole crew available. Other tools such as
> BiggerHat or TheoryFaux have a crew builder, but they don't allow you to create
> a custom leader like you have to do for campaign play. So a crew builder where
> you can start a session and have your opponent join it, so that you can see
> each other's crews selected from your arsenals and equipment as well as your
> leaders, would be very helpful.

That gap is real and it is specific to this app: **every other crew builder can
build a crew, and none of them can hold a leader that does not exist on a card.**
Campaign leaders are built, not hired, so the one tool that could show both
crews at once is this one.

It also belongs to v3 rather than beside it. An encounter is a thing that happens
between two *arsenals* at a *table* — which is exactly what a participation joins
— and it could not have been modelled cleanly while an arsenal was something that
lived inside a campaign.

### The Encounter

A game in preparation, living on the campaign beside `games[]`. Sketch, not yet
built and deliberately not written into `shape/` until it has been argued about:

```js
createEncounter({
  id: 'enc_…',
  week,
  status: 'hiring' | 'revealed' | 'played',
  encounterSize: null,            // agreed; `encounterCapFor` is the ceiling
  strategy: '',
  crews: [{
    arsenalId,
    modelIds: [],                 // must be in that arsenal
    equipment: [{ equipmentId, modelId }],
    soulstonesSpent: 0,
    revealed: false,
  }],
  gameId: null,                   // set when it resolves into a game
})
```

Four rules that fall straight out of the book and should be written down before
anyone writes the screen:

- **Hidden, then revealed.** Malifaux hires simultaneously and then reveals, and
  p. 19 is explicit that the campaign rating is worked out "after hiring and
  revealing crews". So `revealed` is per crew, and the opposing list is not
  readable until both sides have set theirs. A crew builder that leaked the
  opponent's list while you were still hiring would be a worse tool than a
  notebook.
- **You may only hire out of your arsenal**, and the leader and totem cost 0
  (p. 19). The arsenal has always been the constraint; this is the first screen
  that actually enforces it.
- **The campaign rating stops being typed in.** It is equipment selected at hire,
  +1 per leader and totem advancement, minus injuries — every term of which the
  encounter now knows. `ratingForGame` already computes it; today the aftermath
  asks the player for the number only because nothing had the inputs.
- **Resolving an encounter creates the game**, carrying `arsenalId`,
  `opponentArsenalId`, `encounterSize`, both ratings and `equipmentHired` across.
  The aftermath then starts from facts rather than from typing.

Sharing works the way membership already works: the host's campaign is the row,
`campaign_members` says who may read it, and `publicMember` stays the one
function that decides what leaves. No new privacy surface, and **no user ids
cross** — an encounter shows nicknames and arsenals, like the shared page.

---

## Three things the first real game exposed in the aftermath

Also 2026-09-02. All three sit on the path a player walks every week, which is an
argument for doing them before the crew builder.

### 1. The hand should be recorded, and spent

Phase 1 records `handSize`, a number. The player then has up to four real cards
in their hand and no way to tell the app which one they cheated a flip with.

The record should hold the cards:

```js
hand: [{ value, suit, spentOn: null }]   // 'barter' | 'advance:0' | 'doctor:2' | 'injury:mdl_1'
```

and every flip after phase 1 offers the unspent ones. This is not decoration. The
whole reason the aftermath is one flow and not six screens is that **the hand is
a single economy spent across six phases** — and the app currently tracks the
size of that economy and none of its contents. Recording it turns the rule the
book actually states, *"you must decide whether or not to cheat a flip before
moving on to another flip"*, into something the app can hold you to rather than
something you hold in your head.

**It does not weaken the standing rule that the app owns no fate deck.** Every
card is still typed in, because it was flipped on a table in front of an
opponent. Recording what you drew is not dealing it, and there must still be no
"flip for me" button.

### 2. The starting scrip was never paid — fixed in v0.19.1

The owner's note: *"it also currently does not allow for you to have scrip from
the pre-game; like if you hired a list that doesn't take your full 25 points then
you ought to have scrip for that."*

**"25 points" is the tell.** That is the starting arsenal, and the book grants
the scrip outright:

> Each player has 25 soulstones to add models into their starting arsenal. […]
> Each soulstone a player chooses not to spend during this step becomes one
> scrip, up to a maximum of three scrip.
> — *Index of the Untold*, p. 15

This was read as a request about hiring for an encounter first, and answered
"the book says no". That was the wrong rule. Both are worth keeping straight,
because the app has to behave differently for each:

| | |
|---|---|
| **p. 15**, starting arsenal | unspent soulstones → **scrip**, capped at 3. Real rule, and we were not paying it. |
| **p. 19**, hiring for an encounter | excess soulstones → the **soulstone pool** for that game, never scrip |

#### What was actually wrong

`Record` has computed this number since v0.1 and printed it in the tally —
"22/25 spent · **3 scrip**" — and never written it anywhere. `arsenal.scrip`
stayed at 0. The display was right and the arsenal was wrong, which is the worst
version of this bug: the screen tells you you have the scrip, so you spend an
evening wondering why the campaign disagrees.

There was a second, quieter half. The tally totalled **every** model in the
arsenal, not the starting ones. During creation those are the same list, so it
looked correct forever; open the same screen in week three and a 40ss roster
reads as the starting arsenal, the grant computes to zero, and a player who had
been paid would have it taken back.

#### How it is fixed

`startingArsenalSpend` counts week-0 models only — and deliberately still counts
a starting model that has since been annihilated, because the soulstones were
spent and a death in week four does not make the starting arsenal retroactively
cheaper. That is the opposite of what `totalFor` needs, which is why they are two
functions over one list rather than one function with a flag.

`startingScripPatch` then **reconciles rather than appends**. The grant is
derived from the starting arsenal, `startingScripGranted` records what has
already been paid, and the patch moves the balance by the difference — so adding
a model afterwards takes the change back, removing one pays the difference, and
calling it ten times pays once. Appending would have been shorter and would
double-pay the first time anybody edited their starting arsenal twice, which is
the same mistake §3 below is about.

`startingScripGranted: null` means *never reconciled*, which is deliberately not
`0` (*reconciled, and the grant was nothing*) — the same distinction `isDirty`
makes in `storage.js`. Every arsenal on the database predates this and carries
null.

#### Why existing arsenals are offered it rather than given it

Everyone already playing is owed up to 3 scrip. Paying it on load would move a
number in somebody's in-progress campaign with no explanation, which is
indistinguishable from a bug — and there are other people's campaigns on the
database now. So `owedStartingScrip` drives a note on the creation screen that
says what the rule is and offers a button. The player decides.

#### Still missing, and genuinely a house rule

Nothing shows the **encounter** leftover — the p. 19 soulstones — at all. That
is worth building. If a group wants those as scrip instead, that is
`unspentHireBecomesScrip` in `houseRules`, defaulting off, with the reasoning in
a `.gap-note` so it shows in both Hank modes (§5).

### 3. The aftermath must go backwards, and then lock

`nextPhase` is the only way to move, and there is no way back. A player who
mistypes a flip in phase 3 finds out in phase 5 and has nowhere to go.

The fix is not "add a Back button". It is a change in where the truth lives:

> **Every phase's effect on the arsenal must be derived from the record and
> reconciled — not appended when a button is pressed.**

Today the writes are fire-and-forget: `buyEquipment`, `addInjury`, `spendScrip`
and `advanceLeader` all fire on confirm, and only `paid` and `advance.applied`
guard against firing twice. Barter, the doctor and the injury flips all append to
arrays and would double on a revisit. `CLAUDE.md` already flags this ("every
write has to be idempotent against a reopened phase — check the rest"); adding a
way back makes it certain rather than likely.

So: the aftermath record is the source of truth for the whole walk, the arsenal
effect is computed from it, and moving between phases re-derives rather than
re-applies. `done: true` then means what it says — **the decisions lock**, the
scrip and the injuries stand, and the record becomes history.

This is the rule the rest of the project already lives by (nothing derived is
stored; one place decides), applied to the one flow that has been getting away
with the opposite because it only ever ran forwards.
