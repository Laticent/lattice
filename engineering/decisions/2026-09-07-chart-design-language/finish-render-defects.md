# What the finishes actually rendered — and the two audits that said they were fine

Date: 2026-09-13. Subject: the `pigment` / `etching` / `tone` inspection decks
built from `kernel.marks` (`.scratch/finishes/`, not shipped).

I sent three finish decks for review and reported "0 AA text failures, 0
imperceptible marks" for all three. The decks were badly broken and the report
was wrong. This note records what broke, what the instruments missed, and what
now measures each thing, because every defect below was invisible to a green
gate and visible in the first five seconds of looking.

## 1. The defect: a finish that flattens an encoding

Thirty mark classes across the three finishes painted **one color where the
baseline painted many** — five pie wedges in a single blue beside a legend
showing five hues, seven waterfall bars with rises and falls identical, eight
choropleth legend swatches all the same, five sentiment steps rendered as one
step, three radar series with one outline.

The cause is one line of architecture. A finish repaints a mark through a
`var()` fallback chain of hue names. The chain had **no per-slot term**, so
every element of a class resolved the chain's last resort,
`--chart-cat-1-hue`. Where a member publishes its slot as a custom property
(`--row-hue`, `--series-color`, `--pill-hue`) the chain found it; where the
slot lives in a per-element `<radialGradient>` or a `fill=` presentation
attribute — pie, waterfall, slope, and the map and radar key swatches — there
was nothing for CSS to read, and a CSS `fill:` rule beats a presentation
attribute, so the finish overwrote a correct per-slot paint with slot 1's.

Four further causes, each found by measuring rather than reasoning:

- **A `:not([data-hue])` fallback outranked all eight tone steps.** It was
  written as a safety net for marks that stamp no slot attribute. There is
  nothing for it to catch — every element matches exactly one of
  `:nth-of-type(8n+1 … 8n+8)` — and being emitted last at equal specificity it
  overrode all eight. One line, and it collapsed the entire tone finish.
- **`:nth-of-type` cannot discriminate one child per parent.** One `<span>` per
  `<td>`, one dot per `<li>`: every element is position 1, so eight steps
  become one. Those marks need the attribute they actually carry
  (`[data-mood]` on the parent, `tr:nth-of-type(N)`, `[data-series]`).
- **A constant ink took the status off the edge too.** `tone`'s spec says a
  status mark's body joins the one hue and *the status stays on the edge*. The
  generator strokes with `--chart-cat-1-ink`, so progress's five pills rendered
  pixel-identical — body AND edge — and the only remaining differentiator was
  the word inside the pill.
- **A layered mark returned before the tone branch**, so radar's three series
  all took step 0 and the plot read as one undifferentiated mass.

**And a fifth, which is an encoding inversion rather than a collapse: the
finish painted `map`'s no-data countries at the full body level.** A mark that
carries no datum became the darkest thing on the slide (luminance 0.190) while
the eight countries that *do* carry values sat between 0.304 and 0.617. The
choropleth told a reader the listed countries had **less** than the unlisted
ones. All three independent reviewers read the map backwards; no gate did. A
mark with `encodes: none` and `bears: false` is ground, not figure, and the
finish now leaves it alone.

## 2. The instruments that said it was fine

**Neither audit could see any of it, and that is the durable lesson.** A
flattened chart passes an AA audit perfectly: one color is legible, and it is
just as perceivable as the eight it replaced. Contrast and distinctness are
different properties, and nothing in the harness measured the second one.

`.scratch/finishes/flatten.js` now does: per `(member, mark class)` it counts
**distinct resolved paints** in the unfinished baseline and in each finish, and
reports a class that went from k>1 to 1 as FLATTENED. Two details are
load-bearing:

- **The identity is the (body, edge) PAIR, not the body.** Counting bodies
  alone reports tone's status rule — which is *supposed* to share one body —
  as a defect, and misses the case where neither channel separates.
- **Gradient stops must be read from `getComputedStyle(stop).stopColor`.** The
  attribute text is `color-mix(in oklab, var(--chart-cat-3-hue) 42%, …)`, and a
  canvas cannot resolve `var()`, so every stop returned null, every pie wedge
  was skipped, and the pie never appeared in the report at all.

The AA audit had **three** bugs of its own, all of the same shape — measuring
against a surface the thing is not on:

1. **Text was composited against ONE mark.** A label inside three overlapping
   `.55`-alpha polygons was judged against whichever single mark claimed it, so
   radar's tick scored against white and passed at 5.13:1 when it reads 1.86:1
   on the real composite. Auditing one layer of a layered mark measures a
   render nobody sees.
2. **Perceivability was `max(body, edge)`.** An edge does legitimately carry a
   mark — that is why `etching` is not a failure — but reporting only the max
   let a 1px stroke certify a body that had vanished. Both channels are now
   reported; a mark is flagged only when both fail, and the body number is
   always printed.
3. **The worst-case backdrop was seeded with the canvas**, which made the white
   canvas a candidate backdrop for white ink: journey's actor initial scored
   exactly 1:1 in all four documents for a pair that renders at 8.3:1. Then,
   once seeded correctly, it still judged text against *intermediate*
   composites — the layer underneath the top one, which the text never touches.
   Only the final composite is visible.

**A fourth bug, found only after the first three were fixed: SVG text paints with
`fill`, not `color`.** Reading `color` first meant the inherited CSS color
answered for every SVG label and `fill` was never consulted, so state-chart's
step ordinals - which sit inside a filled box at 3.10:1 - were scored with an ink
they are not drawn in and came back clean. Finding it needed a fifth fix first:
the audit tested only a label's CENTER against a mark's fill geometry, and an
ordinal tucked into a rounded box's corner can have its center outside the fill
while the glyphs plainly sit on it. Five sample points now, not one.

Bug 3 is worth its own line: **an audit that invents failures is as useless as
one that hides them**, and both halves of it were the same error in opposite
directions. Bugs 1, 2 and 4 are one error three times over - reading a
property that is not the one doing the painting. That is the thing to check first
in anything here that measures a rendered surface.

## 3. Where it landed

Flattened mark classes: **30 → 0**.

The last one fell to a fix that was really the same defect wearing the edge
instead of the body: **an edge's last resort was a constant ink**. Only five
members publish an ink name, so everything else outlined in `--chart-cat-1-ink`
— every pie wedge boundary one blue against a legend showing five, every radar
vertex marker a blue ring on all three series, every waterfall bar blue-edged
with the sign left in the body. Under `pigment` that is a detail. Under
`etching` it is the whole finish: the body retreats to a whisper *by design*, so
an edge carrying no identity leaves the categories with nothing. Appending the
hue chain to the ink chain means an edge falls back to the mark's own
identity — which is what the unfinished chart already does, and why `line` and
`stacked-bar` were the two members that looked right throughout.

AA, measured with the corrected instrument (light mode, indaco):

| | text failures | marks under 3:1 on both channels |
|---|---|---|
| shipped baseline | 6 | 14 |
| `pigment` | 6 | 7 |
| `etching` | 5 | 7 |
| `tone` | 6 | 7 |

**Every remaining failure is present in the shipped baseline and every finish
improves on it.** The finishes introduce none. The pre-existing ones are
radar's tick labels (1.77–1.86:1 on the composited polygons) and journey's task
chip at 1.07:1 — logged here, not fixed, because they are off the path of this
change (HARD RULE #18).

The map legend needed the same correction in a different register: seeding the
finish's raw band endpoints gave etching's eight chips a 3% luminance spread —
eight identical swatches explaining a map that ramps properly — because a
region's `--mix` is the *datum* scaled by the band. The legend walks the datum.

One measured level: a text-bearing ramp takes **0.75** of the band. Swept at
1 / 0.75 / 0.6 / 0.5 against the real render — the full band leaves tone's
"92%" label at 3.85:1; 0.75 is the longest band that clears 4.5:1.

## 4. What this says about the mark contract

`kernel.marks` did its job: the finish reaches all 21 members because every
member declares its marks by class, where the prototype's attribute keying
reached 6. But the declaration says what a mark *is* — paint, encodes, bears —
and not **where its slot lives**. That gap is the whole of §1. A future
`kernel.marks` row could carry the discriminator (`slotKey`), which would
delete the hand-written seeding table in `.scratch/finishes/gen.js` and make
the flattening class unrepresentable rather than merely detectable.

Until then the detector is the guard, and it belongs next to the AA audit
wherever this work lands: **contrast and distinctness are different questions,
and a chart can pass one while losing the thing it was drawn to say.**
