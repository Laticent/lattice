---
status: superseded
summary: >-
  `flowedSpill` in `overflow-probe.js` compared a box's flowed children against the BORDER box, so
  every box granted its children an overflow allowance equal to its own padding — and a layout that
  reserves a chrome band with `padding-bottom` was blind by exactly that reserve. Found on a
  coverless `split-panel` split page, where a member list's rect ends 76.4px inside the 155.52px
  band reserved for the forward pointer and paints under it, with no overflow class, no
  `clip-marked` and a clean `lint:deck`. The fix insets the comparison rect by the box's own
  padding. REJECTED on measurement: a 257-deck sweep took newly-flagged sections from 9 to 38, and
  all 29 are FALSE POSITIVES — a slide frame's safe margin is also padding, and content dipping
  into it is benign. The premise "past the content box is overflow" cannot separate a chrome band
  from a safe margin geometrically. A reserved band must be DECLARED, which is the design this
  note set out to avoid.
builds-on: 2026-09-01-autosplit-splits-on-structure.md
---

# A reserved chrome band is not a free overflow allowance — and geometry cannot tell it from a safe margin

*2026-09-14 — `lib/core/overflow-probe.js`*

`flowedSpill` compared a box's flowed children against `getBoundingClientRect()` — the **border**
box. Every box therefore granted its children an overflow allowance equal to its own padding, and
a layout that reserves space for chrome with `padding-bottom` was blind by exactly that reserve.

## What it cost

Found on a coverless `split-panel` split page. That layout reserves 155.52px at the bottom for its
forward-pointer pill. With three members at 32 words:

| register | reads | why |
|---|---|---|
| the panel's own dims | `scrollHeight 685 / clientHeight 685`, spill **0** | the content genuinely fits the PADDING box |
| the fold over children | nothing to fold | the list is `overflow: visible`, so it GROWS (`scrollHeight === clientHeight === 527`) |
| the discovery pass | skipped | the list is not a clip box, so `clipsOwnOverflow` rejects it |
| `flowedSpill` | **0** | the list's rect bottom (1270.9) is inside the border edge (1350) |

The list's rect ends **76.4px past the panel's content edge** (1194.5) and paints under the pill.
No `overflow` class, no `clip-marked`, a clean `lint:deck` — a slide that ships broken while every
channel says it is fine. Three rounds of component CSS were spent working around this before
anyone measured the probe itself; one of those rounds shipped a regression that erased an author's
entire member column, and was reverted.

## What was tried, and why it does not work

In normal flow a child is laid out inside its parent's content box, so the obvious fix is to inset
`flowedSpill`'s comparison rect by the box's own padding. It is ~18 lines, needs no per-component
declaration, and it does catch the `split-panel` case: 32 words flags, 24 stays silent.

**It also produces 29 false positives, and the reason is the premise itself.** Measured across 257
decks (every top-level `examples/` deck plus all 82 component galleries), flagged sections go from
**9 to 38**. The extra 29 are almost exactly one page per chart gallery — the distribution that says
"systematic", not "29 independent defects".

The mechanism, measured on `lib/components/chart/bar/bar.gallery.md` page 11:

| basis | spill | verdict |
|---|---|---|
| border box (7920) | **-68.4** | no overflow — the list ends 68px clear of the slide edge |
| content box (7832) | **+19.6** | past `TOL`, flags |

The section carries `padding: 88px` — the slide's **safe margin**. Its list runs 19.6px into that
88px and is completely legible. Nothing is wrong with the page.

So padding is not uniformly "somewhere children do not go". A chrome band reserved under a pill and
a slide frame's safe margin are both `padding`, they are geometrically identical, and content in the
first is a defect while content in the second is fine. **No geometric measure can separate them.**

## What would work, and what it costs

The band has to be DECLARED — a layout that reserves space for chrome marks it (a custom property
on the reserving box), and the probe treats only declared reserves as out-of-bounds. That is the
machinery this note opened by saying was unnecessary, and the 29 false positives are the argument
for it.

It is more expensive than it looks: every layout that reserves chrome has to declare it or stay
blind, which is the same "silent by default" failure mode `CLIP_CELL_SELECTOR` was inverted to
escape in 2026-08-03. Worth doing, but as its own piece of work with that history in view.

## What this does NOT do

Nothing, yet — the change was reverted. Had it shipped it would have made the `split-panel`
overprint **visible** without stopping content reaching the band: an
over-stuffed member is now reported like any other overflow — the author is told, `lint:deck`
warns, and the page carries the ring — which is the contract every other layout in the engine
already has. Whether that band should also be un-enterable is a layout question, and a separate
one.
