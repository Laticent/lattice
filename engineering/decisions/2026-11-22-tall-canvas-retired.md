---
status: shipped
summary: >
  The tall portrait canvas (#3088's `canvasAspect`, `printsAsLarge`, `fitsMeasuredBox`) never changed a byte once the
  chart form kernel drew every portrait chart, and its guard tests could not fail. Deleted with its two trial draws;
  output byte-identical on 222 chart decks at seven sizes; a new test pins the form-kernel premise.
---

# The tall portrait canvas is retired: the chart form kernel took its job

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
