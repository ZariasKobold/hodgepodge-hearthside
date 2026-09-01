# Splitting arsenals from campaigns — the plan for `schemaVersion: 3`

Status: **proposed, not started.** Written 2026-09-01, at v0.18.5.

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

1. **The pure shape first.** `createArsenal`, `createCampaign`, `migrate` v2→v3,
   `belongsTo`, encounter-size arithmetic — all in `src/lib/`, all tested, before
   any component moves. This is §6, and it is the reason the campaign arithmetic
   was debuggable when a scrip total was disputed.

2. **`migrate` v2 → v3, locally, both directions in mind.** Each existing
   campaign splits into one arsenal plus one campaign, with a participation
   joining them. The arsenal keeps the *existing* `ars_…` id — it already has
   one, and reusing it means the D1 `arsenals` rows line up rather than
   orphaning.

   `migrateLeaderToCampaign` has never been run against anything but a synthetic
   record (`CLAUDE.md`, "Never verified"). Do not add a second unverified lift on
   top of it. Run v3's migration against **real exported JSON from the live
   account** before trusting it.

3. **The UI, against local storage only**, with sync switched off. Play a real
   week. The shape is wrong in some way nobody can predict from here, and finding
   that out before a schema is on the remote database is the entire lesson of
   `## 12b`'s "build order matters".

4. **Migration 0005**, once the local shape has survived a real week:
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

## Open questions, to settle before writing code

1. **Does a solo player have a campaign at all?** A leader you are building
   alone still needs weeks, house rules and an aftermath. Either every arsenal
   gets an implicit campaign of one, or the campaign fields collapse onto a
   soloing arsenal. The first is more uniform; the second is less to explain.
   Recommendation: implicit campaign of one, created silently, so there is
   exactly one code path.

2. **Who owns the week?** Today it is per campaign, which is right for a table
   playing together. If arsenals join mid-campaign, week 1 for them is not week 1
   for the host. The book assumes everyone starts together; decide whether to
   enforce that or record a join week per participation.

3. **What happens to an arsenal when its campaign is deleted?** Not a cascade —
   that is the mistake this document exists to avoid repeating. The arsenal
   should survive with `campaignId: null` and its history intact.

4. **Can a host see a member's arsenal before admitting them?** No. Say so in a
   test.
