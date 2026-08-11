---
status: shipped
summary: States "the stage owns the outer inset, a body owns only the spacing between its own elements" as a named Forms invariant (design/forms.md §6.1) and brings the two buckets that broke it — chart and diagram — into line with the four that already kept it. Both re-derived the frame inset with the same `calc(100cqi - 2 * var(--sp-2xl))` expression, and the chart stacked its own `padding: var(--sp-lg) var(--sp-2xl)` on top, so a chart's figure paid 192px per side against prose's 64 and a diagram paid 128. Both calc copies retire; `.chart-body` and the mermaid box now fill their container exactly; the chart's per-chart inset tunings (family default, tall/strip, state-chart, timeline-list, timeline-list tall/strip) re-home to `.cell-stage` verbatim; the glass panel's inset moves to the opt-in `.canvas` rule where it is earned; the `section.chart-frame` padding block is SCOPED to `:not(.form)` rather than deleted (it is live on the `no-form` path — the card's "dead rule" reading was measured only under the Form). Block axis is neutral to the pixel (the cqh basis is the same number, subtracted one box higher); the inline axis reclaims the duplicate, so every chart figure gains 2 × --sp-2xl and every diagram body aligns with its own title, dek and Key Insight for the first time. Kept by two paired gates: `checkStageInsetOwnership` (browser-free, in build:check) and a measured inset assertion in check-chart-fit.js at three sizes.
---

# The stage owns the outer inset

**Date:** 2026-08-11
**Area:** forms / charts / diagrams / gates
**Issue:** #1598 (the structural precondition for #680, which stays open)
**Governing docs:** `design/forms.md` §5/§6 (the Cell ownership line, the gap +
clip contract), `engineering/decisions/2026-06-26-frames-as-flex-cell-trees.md`
§6/§7 (the record that revived `.cell-stage` as a real element)
**Adjacent and constraining, not superseded:**
`2026-06-15-form-chart-clip.md` (why the SVG sizes off a `container-type: size`
chart-body), `2026-07-04-chart-container-fill-sizing.md` (the container-fill
model built on it), `2026-07-15-viz-frame-merge.md` §5 (the flex pin that makes
an overstuffed chart spill rather than silently clip).

---

## 1. The rule

> **The stage owns the outer inset. A body owns only the spacing between its own
> elements — `gap` between its children, plus whatever padding is genuinely
> required by a thing that paints its own surface.**

HARD RULE #20 already fixes *what* to space with (`padding` and `gap`, never
`margin`). This fixes *which box* the outer inset belongs to. Where there is no
stage — a `no-form` slide, a Read·Article `figure` re-host — the box that HOLDS
the body plays the stage's part. The rule is about ownership, not a class name.

Four of six buckets already kept it. This card wrote it down and fixed the two
that did not.

## 2. What was wrong, measured

Emulator render → headless Chromium, 1280×720 slide box, indaco, landscape.
Distance from the slide edge to the body box:

| bucket | body element | insets | body box | painted content |
|---|---|---|---|---|
| prose (`compare-table`) | `p` | stage only | 64 | 64 ✅ |
| code | `pre` | stage + the block's own padding | 64 | 88 ✅ |
| masthead (band) | — | stage inset; `padding-bottom` only | 64 | 64 ✅ |
| footer (band) | — | positional, no padding | 30 | 30 ✅ |
| **diagram** | `.mermaid-svg` | stage **+ a width calc** | 128 | 128 ⚠️ |
| **chart** | `.chart-body` | stage **+ a width calc + padding** | 128 | **192** ⚠️⚠️ |

Both violators re-derived the inset with the *same* expression,
`calc(100cqi - 2 * var(--sp-2xl))`, which appeared in exactly two components and
nowhere else in `lib/`. The shape is invisible as a defect because it reads as
**sizing**: it takes the container's own width in container units and subtracts a
spacing token, and the box it produces is centered, inside the frame, and
overflows nothing. It is simply inset twice.

The cost of that invisibility is on the record: #680 costed the chart's inline
debt as "128px of inline padding". It was **256** — the width calc was a second,
separate inset doing the first one's job, and it was not counted.

## 3. What changed

- **`.cell-stage` gained the outer inset** on the chart path
  (`section.chart-frame > .cell-stage { padding: var(--sp-lg) var(--sp-2xl) }`).
  Diagram takes **no** stage padding — see §5.
- **Both width calcs retired.** `.chart-body`, the `.mermaid` runtime target, the
  un-rendered source `<pre>`, and `.mermaid-error` are all `width: 100%` now.
- **`.chart-body` lost its own padding** and keeps everything else that made
  deleting the element wrong: `container-type: size` (the definite box the SVG
  sizing model reads), the `flex: 0 0 auto` pin on the list-charts (so an
  overstuffed one SPILLS and `overflow-probe.js` catches it), the panel anchor,
  the clip, and its named contract in `check-chart-fit.js`, `overflow-probe.js`,
  `carousel.js`, `split-envelope.js`, `prose-projection.mjs`,
  `masthead.transform.js`, `player-core.mjs`, `manifest.schema.json`.
- **Five per-chart inset tunings re-homed** to the stage cell verbatim — a
  parent's padding cannot be overridden by a child, so a tuning of the inset has
  to travel with the inset it tunes:

  | | block | inline |
  |---|---|---|
  | shared default | `--sp-lg` | `--sp-2xl` |
  | tall/strip family | `--sp-md` | `--sp-sm` |
  | state-chart | `--sp-md` | `--sp-2xl` |
  | timeline-list | `--sp-xl` / `--sp-lg` | `--sp-2xl` |
  | timeline-list tall/strip | `--sp-lg` | `--sp-xl` |

- **The glass panel keeps its inset and now OWNS it.** `.canvas` re-adds
  `padding: var(--sp-lg) var(--sp-2xl)` to `.chart-body`, conditional on the
  surface existing. That is the same case `code`'s `pre` earns its padding for,
  and the reason the default (canvas off, nothing painted) earns none.
- **`.chart-caption` lost its inline padding, kept its block padding.** It is a
  stage SIBLING of the body, so its `--sp-2xl` was the same duplicated inset —
  and with the stage now carrying that inset, leaving it would have pushed the
  caption's text 64px inside the chart it captions. Measured: the caption's text
  box is the same 1024px at the same x as before.
- **The un-rendered diagram source `<pre>` lost its `--sp-sm`/`--sp-md`
  padding.** That box explicitly paints nothing (`background: none !important;
  border: none !important` two lines up), so it owns no inset — and the padding
  contradicted the rule's own stated goal three lines down, which is to MATCH the
  rendered `.mermaid` container so the slot does not reflow when the diagram
  swaps in. `.mermaid` has no padding.

## 4. The "dead rule" was not dead — it was mis-scoped

The card asked to delete
`section.chart-frame { padding: 0 0 calc(4.375 * var(--_sec-1cqi)) }` on the
grounds that it never applies: `section.form`'s
`padding: var(--frame-y) var(--frame-x) var(--footer-reserve)` has equal
specificity and lands later in the bundle, and a chart section measures 64px
sides despite a rule saying 0.

That measurement is right, and it was taken **only on the Form path**. `no-form`
(per slide) and `form: off` (per deck) are supported opt-outs, and on that path
there is no `.form` class for the frame rule to attach to — so this block is the
only thing insetting the section. Measured on a `no-form` piechart: section
padding `0 0 56px`, body box 1152 @ x=64, i.e. exactly the geometry this rule
plus the (now retired) width calc produced. Deleting it would have moved the body
box and the footer band on that path.

So it is **scoped, not deleted**: `section.chart-frame:not(.form)` now names the
one path it governs, and reads true. It carries the inline inset (`--sp-2xl`,
what the retired calc contributed there, so the body box does not move) as
padding, and the block seam as a `row-gap` — because on that path the section is
a flex column holding `h2 → .chart-body`, and a `padding-top` would have inset
the HEADING, which is chrome, not body. A gap is spacing between a container's
own children: the half of the rule a container is allowed to own.

A rule that reads as if it were in force and is not is worse than no rule. That
was the card's real complaint, and scoping answers it without breaking the path
the card had not measured.

## 5. Calls made explicitly, so they are not discovered later

- **Diagram takes no stage padding, chart does.** A chart is a figure among
  chrome; its stage inset is a real design tuning, and the values are the ones
  `.chart-body` already carried, so a chart's berth is unchanged. A diagram is a
  single self-scaling figure with PROSE SIBLINGS in the same cell — a dek `<p>`
  above and a Key Insight `<blockquote>` below, both `align-self: stretch` to the
  stage edge. Insetting the stage would have insetted them too. Before this
  change the mermaid box was the only thing on a diagram slide out of line with
  its own title; `width: 100%` with no stage padding puts it on the same left
  edge as the title, the dek and the Key Insight. Measured across all 26 diagram
  slides in `diagram.gallery.md`: body 1024 @ x=128 → 1152 @ x=64, heights
  unchanged.
- **The diagram caption's `padding-top` stays a padding.** It is spacing between
  stage children, which the rule would normally hand to `gap` — but the stage's
  gap is ONE value shared by every seam in that column (`--sp-sm`, and `--sp-xs`
  when a dek leads), and this seam wants a step more air than the others. A gap
  cannot be asymmetric, so expressing it as one would move two seams to fix a
  third. It adds nothing on the inline axis and nothing at the stage edge, so it
  is outside what the rule governs.
- **The Read·Article projection (`figure.chart-frame`) is out of scope.** It
  re-hosts a chart body inside a `figure` with no Form and no `.cell-stage`, so
  an inset on the body is correct there. `timeline-list`'s figure arms keep their
  padding and the projection is byte-identical.
- **Two stages are not single-child.** `gantt` holds `chart-body |
  chart-details`; `state-chart` holds `chart-body | chart-caption | chart-details
  | state-legend`. A stage inset insets those siblings too. `chart-details` is
  `hidden` (no layout), `state-legend` is a centered flex band (narrowing it
  moves nothing), and `chart-caption` is handled above — measured identical.

## 6. What it cost, measured

`test/fixtures/chart-fit.md`, landscape, before → after:

- **Block axis: neutral to the pixel.** The `cqh` basis is "chart-body fill
  height minus the inset"; the inset moved one box up, so the number is the same.
  Every SVG chart's painted box keeps its height and its `y`. The card budgeted
  for this to move; it does not.
- **Inline axis: the duplicate is reclaimed.** Every chart figure's box goes
  896 → 1024 (+128). For a height-bound SVG chart that is a wider box around the
  same letterboxed ink; for gantt (width-bound at landscape) the drawing itself
  grows 209.1 → 238.9 tall; for the HTML-bodied charts (progress, kanban,
  timeline-list, roadmap) the content genuinely widens.
- **state-chart: byte-identical**, as predicted — it never carried the width
  calc, and is the in-tree precedent that the calc was never load-bearing.
- **`check:chart-fit` improved, and was already red.** Before: 5 clips
  (landscape roadmap +10.5, portrait progress +15, portrait timeline-list +12.3,
  square progress +55.5, square roadmap +203). After: 4 — landscape roadmap
  fixed, square roadmap 203 → 45.3, the other three byte-identical. The three
  survivors are a pre-existing capacity problem (a chart that does not fit at
  portrait/square even with autosplit), not an inset one, and are **off the path**
  of this change: tracked as **#1600** rather than pulled into this diff or left
  unrecorded (HARD RULE #18). `SANCTIONED_CLIPS` stays empty.
- **`chart-overflow-preserved.test.js`: 7/7 green.** The spill threshold is
  unchanged by construction — the body's natural height no longer includes its
  own 2 × `--sp-lg`, and the stage's content height is smaller by exactly that.

## 7. How the rule is kept

Two gates, paired deliberately, because each is blind to the other's failures.

- **`checkStageInsetOwnership`** (`tools/check-ownership.js`, via `build:check`).
  Browser-free, budget 0 + `SANCTIONED_STAGE_INSETS`, failing both ways like
  `SANCTIONED_MARGINS`. It fires on a container-unit subtraction on a SIZING
  property — the shape the defect actually takes — across every component, the
  moment it is typed. A container-unit subtraction in `padding`/`gap` is spacing
  that says so, and is the rule's own idiom, so it is not matched.
- **The inset assertion in `tools/check-chart-fit.js`.** A real render at
  landscape / portrait / square asserting the body's border box coincides with
  the stage's content box on the inline axis, and that the body carries no
  padding of its own unless it PAINTS ITS OWN SURFACE — tested by measurement
  (a non-transparent background, a background image, or a real border), not by a
  class list that would need syncing with every future painted body.

  The block axis is deliberately unasserted: a pinned list body (`flex: 0 0
  auto`) is centered at its natural height and legitimately does not fill the
  cell, and an overstuffed one MUST spill it so `overflow-probe.js` can see it.

  Not vacuous, verified: run against the pre-change tree it reports all 18 chart
  slides and all 26 diagram slides; against the shipped tree, none.

## 8. Relation to #680

#680 is the *outcome* card — quadrant point labels sit below the house's smallest
type tier. This was the *structural precondition*. Its "lever 2 — reclaim height"
is the same 64px, but #680 framed it as a raw padding deletion needing its own
costing and undercounted the inline side by half.

The measured arms (each patched into the live rendered page and re-measured, so
every arm is the same DOM):

| arm | quadrant svg | % of stage | painted label |
|---|---|---|---|
| baseline | 896×323 | 64.9% | 11.0px |
| **block padding → 0** | 896×387 | **77.7%** | **14.0px** |
| drop the width calc | 1024×323 | 74.1% | 11.0px |
| inline padding → 0 | 1024×323 | 74.1% | 11.0px |
| all three | 1152×387 | 99.9% | 14.0px |

The unit is **height-bound**, so every inline change buys a wider box and no
larger label. Only the block inset moves the label — **+27%**. This change took
the inline duplicate (which is a correctness fix, not a design change) and left
the block inset alone (which is a design decision about a chart's berth). After
it, #680's reclaim is **one number in one place** — the `--sp-lg` in
`section.chart-frame > .cell-stage` — instead of three insets in three boxes.

Neither card closes the other. #680 stays open.
