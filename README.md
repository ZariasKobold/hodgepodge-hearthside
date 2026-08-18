# Hodgepodge Hearthside

*An Emissary's Campfire Wisecracks for Campaign Play*

hodgepodgehearthside.com

A companion for Malifaux Fourth Edition campaign mode — building a leader from
scratch under the archetype rules, and tracking what happens to the arsenal
over the weeks.

Wyrd's official Crew Builder already does crews, cards, and in-game tracking,
and does it well. It does not do campaign mode. This fills that gap. Assume the
player has the official app open beside this one.

## Hank

The app is narrated by Hank — the Hodgepodge Emissary — with his donkey
Henrietta and an unlicensed surgeon named Dr. Morbidius Spiritstitch, who
answers to Dr. Mo. He is not decoration. A campaign leader is assembled out of
actions and abilities borrowed off allies, which makes the narrator and the
mechanic the same idea: a person cobbled together from spare parts, explained
by a man whose entire silhouette is spare parts.

All of his dialogue lives in `src/data/hank.js` — roughly 240 lines across
every step — so the voice can be edited without touching render logic.

**He can be switched off.** The toggle sits in the masthead, defaults to on,
and persists. It exists for the player mid-game who wants the number, the
screen reader user who would rather not hear 200 words before reaching a form
field, and anyone who simply doesn't care for the voice.

**What the toggle must never hide:** rules-gap explanations. Those are
substance wearing a costume and show in both modes. Use `.gap-note`, never
`<HankSays>`.

### The rule that keeps him honest

Every line is chosen from what the app actually knows *at that instant*. On
arrival at the aftermath it knows the week number — not the result, and not
whether anyone got hurt, since injuries come out of flips partway through. So
greetings can't react to a game nobody has described yet. Win and loss lines
fire after the result is recorded; the injury line fires at the flip that
causes it.

That splits most steps into two or three moments rather than one. When adding
a new line, work out what is known when it renders before writing a word.

Two boundaries Hank never crosses: he comments on prices, he never sets them
(no line may suggest a barter rating shifted or a hire cost moved on his say
so), and he never describes what an action *does*, because the app deliberately
doesn't store that text.

## Before you change anything

`CLAUDE.md` at the project root is the project context and working agreement —
session rules, current version, pending work, dialogue rules, architecture
constraints, Hank's character bible, and the legal conditions for publishing.
Read it first.

`docs/VERSION_HISTORY.md` is where "why was it done this way" lives. Read it
before changing anything that looks arbitrary; it probably isn't.

The rule most easily broken by accident: **Hank's dialogue lives in two files
and both must be updated together.**

## Running it

```bash
npm install
cp .env.example .env
npm run dev
```

Then open the printed localhost address.

```bash
npm run test     # campaign arithmetic
npm run build    # production bundle
npm run seed     # optional: build a local register file
```

## The CORS problem, and why this is a Vite project

A browser calling the register directly from another origin gets blocked unless
that server sends permissive headers. `vite.config.js` proxies `/api` to the
upstream host, so in development the request leaves the dev server rather than
the browser and the same-origin rule never applies.

**That proxy does not exist in a production build.** Three options when you
deploy, in order of how much work they are:

1. **Ship a seeded file.** `npm run seed` writes `public/register.json`. Set
   `VITE_REGISTRY_MODE=local`. No runtime dependency at all, but the data goes
   stale with errata and you become its maintainer.
2. **Run a tiny proxy** — a serverless function or a rewrite rule on your host
   (Netlify `_redirects`, Vercel `rewrites`, a Caddy or nginx block) forwarding
   `/api/*` upstream. Same shape as the dev proxy, ten lines of config.
3. **Ask.** If the maintainer is willing to send `Access-Control-Allow-Origin`
   for your domain, the browser can call them directly and none of the above is
   needed.

Whichever you pick, the app degrades to manual entry when the register is
unreachable, so it never hard-fails.

## What it stores, and what it deliberately doesn't

`src/lib/indexing.js` drops every `description` field on the way in. What's kept
is identifiers: model name, cost, faction, keywords, and the names of actions
and abilities. That is exactly what the legality rules need — cost ceilings and
keyword overlap — and nothing more. Rules text stays on the player's own cards.

Two reasons. Wyrd gives their card library away free and sells the cards, so
republishing the text competes with the thing they use to sell product. And
practically, card text changes with errata; names and costs change far less.

## Layout

```
src/
  data/        archetypes, crew card effects, factions — bare facts from the book
    hank.js        all narration, keyed by moment
  lib/
    api.js         register client, throttled
    indexing.js    record → stored shape (this is where text gets dropped)
    validation.js  legality rules
    campaign.js    scrip, ratings, encounter size, experience
    storage.js     local-first persistence + import/export
  hooks/       leader state, roster loading, Hank's toggle
  components/  wizard steps and shared UI
scripts/
  seed.mjs     optional bulk pull
```

### Why `lib/` imports nothing from React

Every rule and calculation is a plain function taking data and returning data,
which is why `campaign.js` was fully tested before any UI touched it. When you
add weekly hires, the arithmetic goes in `lib/` with tests first and the
component comes after. That ordering is what keeps the rules debuggable when a
scrip total disagrees with someone at the table.

### Why validation is split in two

`checkStructure` needs only the archetype: how many of each slot, whether a
trigger is allowed. `checkSource` needs the register: cost ceiling, keyword
overlap, and the master/totem exclusion. Keeping them apart is what lets the
wizard work before any data loads, and degrade to typed entry instead of
breaking.

The master and totem exclusion leans on `cost > 0` rather than the `station`
field, because `station` comes back null on records that clearly should have
one. Masters have no cost at all, so the cost check catches them anyway.

### The house rule you will hit in week two

The weekly hire is mandatory and the first model each week costs 5 less scrip,
so a 3-cost first hire computes to −2. The book doesn't say what happens.
Resolving it as a refund would be an infinite scrip engine. `hireCost` floors at
zero and applies the out-of-keyword surcharge before the discount, and exposes
both as options so a group that reads it differently isn't fighting the app.
See the tests in `src/lib/campaign.test.js`.

## Not built yet

The four creation steps are wired. Weekly hires, aftermath flips, barter,
injuries, healing, advancements, and campaign end are **not** — but both halves
are already written and waiting:

- the arithmetic is in `src/lib/campaign.js`, with the book's own worked
  examples as tests
- the narration is in `src/data/hank.js`, with a picker function per moment

What's missing is the connective tissue. `useLeader` models a single leader; a
running campaign needs a `Campaign` object wrapping several arsenals plus a
week log. That's a change to the shape of stored state, so it's cheaper before
anyone has saved data than after.

Two places to keep Hank quiet when you build them: entering the game record
(someone is doing data entry and wants to finish), and anywhere near a
rules-gap explanation.

## Before publishing

Wyrd's Fan Site and Art Policy permits this, with conditions worth re-reading:

- **Non-commercial.** No ads, no tiers, no upsell. The only monetization
  exception in the policy is ad-supported web video.
- **Freely accessible to the public.**
- The required disclaimer on every page. It's in `App.jsx` — don't remove it.
- No Wyrd trademark in the domain name.
- Don't copy their trade dress; this deliberately doesn't look like their cards
  or their app.
- Permission is revocable at any time, which is why every campaign exports to
  JSON.

Community tools can be submitted at wyrd-games.net/community-creators.

---

Portions of the materials used are copyrighted works of Wyrd Miniatures, LLC, in
the United States of America and elsewhere. All rights reserved, Wyrd
Miniatures, LLC. This material is not official and is not endorsed by Wyrd
Miniatures, LLC. Model data from BiggerHat.
