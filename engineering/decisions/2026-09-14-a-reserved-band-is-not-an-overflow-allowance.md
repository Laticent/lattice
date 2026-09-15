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

## Attempt 2 — the DECLARED band, also rejected, and the reason is not the same one

The note above says "a reserved band must be DECLARED". That was built and measured, and it fails
too — for a reason the geometric attempt hid.

**The mechanism.** `@property --lat-band-reserve` (`inherits: false`), set on the rule that
reserves the band; `flowedSpill` compares that box's children against `bottom - reserve` instead
of the border box. Opt-in, so a box that declares nothing is measured exactly as before. That
part held: 15 `split-panel` decks plus the component gallery at portrait and square report
identical warning counts on base and head, and the detection genuinely fires — the three sweep
cases this note recorded as silent (+18, +22, +26 words of body) all warn.

**Why it was reverted.** On a 3-page coverless `pullquote` run at 40–42 words per member, ALL
THREE pages report `over: true` while **0 px² of glyph ink sits under any chrome on any of
them** — measured by intersecting `Range.getClientRects()` with the `.lat-split-rel` and
`.lat-split-rail` boxes. Nothing is covered; nothing is clipped. Two independent causes, both
structural:

- **The last page of a run has no forward pointer, and reserves the band anyway.** That is
  deliberate — the band keeps the member block from jumping between pages — so it is a LAYOUT
  reserve, not chrome. Declaring it "chrome" makes every last page a false positive the moment
  content reaches the band. Measured false continuously from 40 through 50 words.
- **The reserve is a BOTTOM EDGE; the chrome is a BOX.** The pill spans x695–1001 of a 0–1080
  panel — 28% of the width. Ragged-right content whose last line ends left of x695 is flagged
  with empty space above it.

**The lesson, and it is the one that generalizes.** Both attempts modelled occlusion as a
one-dimensional edge. It is two-dimensional: the question is not "is content below a line" but
"is content under a box, on a page that has that box". A declaration fixes WHICH BOXES may be
asked; it does not make the answer right. Anyone trying this a third time needs a 2D test
(content rect ∩ chrome rect, evaluated per page against the chrome that page actually carries),
and should expect that to be most of the work.

**Two smaller findings worth keeping.**
- The justification for reading the amount from `padding-bottom` rather than the token — "a
  custom property computes to its token text" — is true of an UNREGISTERED property and FALSE of
  a registered one. A registered `<length>` resolves tokens and container-query units to used px
  (`155.52px`, measured, identical to `paddingBottom`).
- But the length form has a hole the flag form did not: overriding the DECLARATION moves the
  padding, while overriding the PADDING does not move the declaration — and editing a panel's
  padding is the ordinary edit. Demonstrated in a browser by forcing `padding-bottom: 0`, after
  which the reserve still read `155.52px`: a standing phantom overflow. "The two cannot drift"
  was written as the justification for the length form and is false in the direction that matters.

## Attempt 3 — the one that worked, and why the first two could not

Both rejected attempts were reinventing a construct the engine already has.

**What the split page actually was.** Measured: a coverless `split-panel` body page rendered with
`cells: []`. No stage Cell, no footer Cell — a bare `<section>` with both wayfinding marks
appended as direct children. That is not incidental; `lib/core/footer-dock.js:32` is
`if (at < 0) return html + mark`, so every docker degrades to section level when the Cell is
missing. On this layout the section IS the panel flex row, so the forward pointer became a third
COLUMN.

**So the band attempt was a hand-rolled footer Cell, and the declaration attempt was a hand-rolled
version of what a clipping Cell already reports.** Neither was a bad implementation of a good
idea; both were re-deriving furniture that exists.

**The fix** is that a split body page composes a footer Cell even when its Frame suppresses one —
sovereignty is a property of a STANDALONE slide, and a split RUN is not standalone. The Cell is
built with the kernel's own `buildFooterCell`, and the pointer, rail and page number then dock
into it exactly as they do on every other layout.

**And the reserve moves.** This is the whole difference from the two failures:

| | where the reserve sat | what the probe saw |
|---|---|---|
| attempts 1–2 | `padding-bottom` INSIDE the panel | children compared against the panel's BORDER box — blind by the height of the reserve |
| attempt 3 | `padding-bottom` on the SECTION | the panel's box genuinely ENDS above the band, so spill past it is ordinary overflow |

Independently re-derived on a real render rather than argued: at portrait `.panel-right` shrinks
936.1 → 835.5px and its bottom edge sits 100.6px above the section bottom, 28.8px clear of the
band. On a deck that fit on base, the branch reports `⚠ OVERFLOW` on three additional pages and
each carries a real "Content clipped" tag. The text's LAYOUT rects sit 78.7px below the panel box
while the panel clips them — layout rect is not painted ink, and the probe reports the clip, not
the rect. The reserve does not hide overflow; it creates real, measured, tagged overflow.

**The cost, stated because it is real:** the band takes roughly 12% of the panel's height at
portrait. Content that previously filled the slide now has less room and may split one page
further. That is the price of the wayfinding, and it is the same price every Form layout pays.
