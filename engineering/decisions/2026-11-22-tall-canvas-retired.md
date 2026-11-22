---
status: shipped
summary: >
  The tall portrait canvas (#3088's `canvasAspect`, `printsAsLarge`, `fitsMeasuredBox`) never changed a byte once the
  chart form kernel drew every portrait chart, and its guard tests could not fail; deleted, byte-identical on 222
  chart decks at seven sizes. A look at all 3,288 portrait chart slides then found three labels off their canvas
  (row names, the ep-curve's end tick, a radar sector name), each fixed at its root.
---

# The tall portrait canvas is retired, and three phone-page labels come back onto the canvas

**Date:** 2026-11-22 · **Slice:** fit desk C0 (`engineering/decisions/2026-11-22-fit-desk-plan.md`)
· **Supersedes:** the tall-canvas half of `2026-11-03-responsive-tables.md` § 31

## What happened

PR #3088 gave a portrait chart a canvas the shape of its box (`ctx.canvasAspect`), and three review rounds hardened
the choice in `lib/transformers/chart-frame.js`: a header check (`fitsMeasuredBox`) and two trial draws scored against
each other (`printsAsLarge`). No one had reviewed the final version, so the fit desk ran one independent `checker` on it.

The checker found that **the choice never changes a byte**. On a portrait page (`aspect <= 1`) the chart dispatch
(`chart-family.dispatch.js` `run`) sends every draw to the phone page (`chart-phone.js` `drawPhone`), and every kind
that read `ctx.canvasAspect` is on the chart form kernel (`FORM_KINDS`). There, `cartesian.js` `viewFor` returns the
form box before it reads the aspect, the quadrant takes `buildQuadrantForm`, and the tower takes `buildTowerForm`.
The form kernel (`2026-11-10-chart-form.md`) landed after #3088 and does the same job better: it sizes the canvas from
the slide's own header, which `fitsMeasuredBox` only approximated.

Measured by the checker on all 641 chart slides in `examples/` and the baseline decks, at aspects 0.8, 9/16, 9/19.5,
1, 1.2 and 1.5: the default draw and a draw with the tall canvas switched off differed on **0 of 3,846** pairs. On
the 69 story slides that reached the trials, the two trial draws cost 555 ms against 257 ms for the real draws.
Its tests could not fail: a mutation that forced the tall canvas on everywhere left
`test/unit/components/tall-canvas-guard.test.js` at 19 of 19.

## What changed

Deleted, since nothing reached them:

- `chart-frame.js`: `printsAsLarge`, `fitsMeasuredBox`, the two trial draws, `slideChrome`'s `leads`, and
  `transformChartSection`'s `opts.fixedCanvas`.
- `chart-redraw.js` `verified`: the third, fixed-canvas try, which could never differ from the first.
- `chart-family.dispatch.js` `boxAspect`, and `chart-box.js` `tallCanvasH` and `BOX_FILL`.
- `cartesian.js`: `viewFor`'s `aspect` argument and its tall branch, and `fitViewToBox` (only the tower called it).
- `quadrant.transform.js` `tallGeom`, the tower's tall branch, and the `ctx.canvasAspect` argument in 13 kinds.

The guard test became `test/unit/components/chart-phone-box.test.js`. It pins the premise this deletion rests on:
every slide of each of those 13 kinds' galleries draws in a form box at story. Dropping `line` from `FORM_KINDS`
turns it red. It also keeps the three tests that were never tautological (the header-driven box, the cohort key, the
wide-glyph key).

**Proof that output did not move:** the engine's HTML for every chart deck in the tree (222 decks) at seven sizes
(hd, standard, mobile-landscape, square, 4:5, story, mobile) hashed the same on `main` and on this change.

## If a kind ever leaves the form kernel

It draws on the fixed 320 x 300 portrait canvas, the way charts drew before #3088. Its text cannot get smaller than
that, so no guard is needed. If a portrait canvas the shape of its box is wanted again, put the kind on the form
kernel. Don't bring back the trial-and-score choice: it guessed the box from the header, and the form kernel measures it.

## § P2 — the portrait slides whose chart text grew

#3088's brief asked for a visual check of the 132 portrait slides whose chart text printed larger than before it.
That list no longer stands apart: since #3088, the chart form kernel and the phone text ladder (`2026-11-10-chart-form.md`,
`2026-11-03-responsive-tables.md` § 32) resized every portrait chart. Against #3088's parent (528178114), 1,756 of the
1,772 comparable portrait chart slides print their smallest chart text larger and 7 smaller. So the check covered every
portrait chart slide in the tree: 222 chart decks at 4:5, story and mobile, 3,288 chart slides.

**How.** A Chromium pass over the HTML export flagged chart text that leaves its stage or the slide, and chart labels
whose boxes overlap: 179 slides. Each one was screenshotted and looked at on contact sheets. Most flags were text a few
pixels outside `.chart-body` but inside the drawing, with nothing cut. Five defects were real:

| Defect | Where | Cause | Fix |
|---|---|---|---|
| A row name loses its first letter (`AMER` as `.MER`, `Onboarding`, `Q1 FY24`, `Payments`, `September 2026`) | heatmap, `bar row`, `stacked-bar row`, every phone shape | The row column grows until `measureLabel` says every name fits. On the form kernel, a word wider than its box falls back to a line budget billed at the flat ladder advance (0.52 em), and capitals paint near 0.7 em: `AMER` measured 34 units read as whole in a 27-unit column | Each kind's row-column loop (`rowGutterForm`, `rowNameColumn`) also requires the widest word, measured by `text-measure.js` `widestWord`, to fit |
| The last return period runs off the right edge (`1-in-2`) | ep-curve with unnamed curves, every size | The ticks are centered on the plot's edges; the right gutter was a fixed 12 units | Each side's gutter holds half its end label (`halfLabel`) |
| A sector name sits against an axis name (`RISK` under "Resilience", `PROCESS` by "Rigor") | `radar quadrant` on phone pages | The name sits 22 units outside the axis labels on the sector's middle angle | It moves the least distance that clears every axis label's box: vertically away from the center, else out along its angle |
| `revise` runs into the `In Review` node | `examples/state-chart-polish.md` p5 at story | Trama's self-loop label placement | Off this path: the state chart never read the tall canvas. `followups.d/` |
| The stress scatter prints its whole drawing small | `scatter.gallery.md` p5 at mobile | The form kernel's over-capacity rule: one cluster of names drops at the box, so the canvas grows 1.7x and every label prints at 59% | Working as the kernel decided; reported, not changed |

**A first fix that was wrong.** Billing every over-wide word at its measured advance inside `measureLabel` fixed the
row names, but cut 38 renders' value labels to `$1…`: a value label is placed against a nominal width narrower than it
paints, and it printed whole and clear before. The fix moved to the loops that size a column, where the measured word is
the question being asked. The final change cuts no label: across the 99 renders it moves, dropped labels and ellipses
are unchanged.

**Proof.** `test/unit/components/chart-phone-edges.test.js` checks each defect at 4:5, story and mobile. Reverting each
fix turns its tests red (row columns 12 of 18, ep-curve 3, radar 3). The changed renders are 99 of 1,554, at the four
phone shapes plus the ep-curve deck's three landscape sizes. Every changed slide was looked at before and after.
