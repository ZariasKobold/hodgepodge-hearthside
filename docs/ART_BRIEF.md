# Art brief — the imagery this app is built to receive

Written v0.9.0, when the visual direction changed from a records office to a
camp at dusk. Everything in `public/art/` today is a **placeholder drawn in
code**. It is deliberately silhouette-only so that it reads as intentional
rather than unfinished, but it is not the real thing and it is not meant to
survive.

This file exists so that art can be made once, to the right spec, instead of
made twice.

---

## How swapping works

Every asset is referenced by **path**, never imported into a bundle. To replace
one, overwrite the file. No component changes, no rebuild step, no cache
busting — Cloudflare Pages serves `public/` verbatim.

```
public/art/hank-portrait.svg     ← the face beside every line he speaks
public/art/road-horizon.svg      ← the band behind the masthead
```

If a raster file is supplied instead of vector, keep the same basename and
change the one `src` in the component (`HankSays.jsx`) or the one `url()` in
`app.css`. Both are marked with a comment saying so.

---

## 1. Hank's portrait — `hank-portrait.svg`

**The single highest-value asset in the project.** It appears beside every line
of narration, which is the most frequently rendered element in the app.

| | |
|---|---|
| Shape | Square canvas, circular crop. The CSS applies `border-radius: 50%`, so anything in the corners is discarded. |
| Rendered at | **66 × 66 px** normally, **48 × 48 px** in `tone="quiet"`, **54 × 54 px** below 520 px wide. |
| Supply at | Vector (SVG) ideally. If raster, **264 × 264 px** so it stays sharp on a 2× display at the largest size. |
| Must read at | 48 px. This is the hard constraint and it is much smaller than it sounds. |

**What has to survive at 48 px:** the wide hat brim, and the fact that a second
creature is behind him. Nothing else will. Facial features, buckles, the texture
of the pack — all of it turns to mud. The current placeholder is a backlit
silhouette for exactly this reason, and that approach is worth keeping even in
finished art: **rim-lit against the fire** rather than lit from the front.

Henrietta should stay in frame. She is established character (§7) and she is
the difference between "a man" and "Hank".

## 2. The road horizon — `road-horizon.svg`

The band across the bottom of the masthead. Currently hills, pines, a leaning
telegraph pole, and the two of them walking.

| | |
|---|---|
| Shape | Very wide. Current viewBox is `0 0 1200 130`. |
| Rendered at | Full masthead width, **118 px tall**, `background-size: cover`, anchored bottom-centre. |
| Opacity | Drawn at **0.55** in CSS, so supply it at full strength. |

**It must survive being cropped.** On a phone the visible slice is roughly the
middle third; on a wide monitor it is the whole thing scaled up. So: no single
focal point that breaks when cut, and nothing important within 15% of either
edge. It sits *behind the navigation buttons* — it is depth, not a picture. If
it starts competing for attention it is too strong.

## 3. Assets there is currently no slot for

Worth making, but the code has nowhere to put them yet — say the word and the
slots get built:

- **A campfire, drawn from the front.** The firelight is presently a pure CSS
  radial gradient with no object at its centre. An actual fire at the foot of
  the page would explain the light.
- **Hank at other moments.** `HankSays` already takes a `tone` prop
  (`normal` / `quiet` / `grave`). A second and third portrait, keyed to tone,
  would cost one line of code and would mean he visibly changes when a leader
  dies. This is probably the best return of anything on this list.
- **Henrietta alone**, for empty states — the shelf with no leaders on it
  currently says nothing but text.
- **A faction mark per faction**, for the shelf cards. Eight needed, and they
  must be *original* — see the constraint below.

---

## Constraints that are not negotiable

**Do not reproduce Wyrd's trade dress.** CLAUDE.md §8 is a licensing condition,
not a preference. The fan policy that permits this project is revocable at any
time. So: no card frames, no Malifaux logo or wordmark, no faction icons traced
or redrawn from official art, no character likenesses from the miniatures line.
Hank and Henrietta are this project's own characters and are safe. If a faction
mark is wanted, it has to be an original device that *means* Guild, not a copy
of the Guild's.

**Do not put rules text in an image.** §4. It would end up in the PNG export,
which persists.

**The palette lives in `src/styles/tokens.css`.** Art does not have to match it
exactly, but it should belong to it:

| | |
|---|---|
| Night | `#17110c` |
| Panel | `#241b14` |
| Ember (the fire) | `#f0a04b` |
| Ember, deeper | `#c9722c` |
| Brass | `#d9ab52` |
| Coal | `#a33f2a` |
| Handbill paper | `#f0e4cb` |

**Imagery is the road, never the swamp** (§7). Hank travels. No crawdads, no
gators, no bayou. Dust, pines, telegraph poles, wagon ruts, a long way to the
next town.

---

## Accessibility note

The portrait renders inside `HankSays`, which is `aria-hidden="true"` by
deliberate decision (§5 — a screen reader user should reach the form fields
without wading through 200 words of narration). So the portrait carries
`alt=""` and costs those users nothing. **If art is ever added outside that
wrapper it needs a real `alt`.**
