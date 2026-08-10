---
status: shipped
summary: #680 said the quadrant "renders tiny — roughly a quarter of the available width" with "labels illegible at presentation size". Both measured true (44% of its box; item labels ~11.8px on a 1920-wide slide) but they are separable, and only the second was worth fixing. Two ways of closing the first were BUILT and REJECTED on sight — widening the plot to 840 units (fills the box, but flattens every cell to ~3:1 and reads as a stretched chart) and pie's square-plot-plus-key-rail (fills the box and is genuinely square, but turns points into numbered dots the reader has to look up). What shipped is the type raise alone: the geometry is untouched and item labels go 8.5 → 9.5 units (~11.8px → ~13.2px at 1920), which is the ceiling the COMMITTED CORPUS allows — the two unit fixtures said 10.5 and the gallery's own 14-item stress slide, denser than either, silently lost a name there. The 44% is accepted as-is: a keyless ~1.2:1 unit in a ~2.5:1 stage letterboxes, and that is what the chart is.
---

# The quadrant: what #680 actually was, and why only half of it was fixed

**Date:** 2026-08-10
**Status:** SHIPPED
**Scope:** `lib/components/chart/quadrant/quadrant.transform.js` (`FS`, `LW.item`),
`lib/components/chart/quadrant/quadrant.styles.css` (the mirrored font sizes).
No geometry change. `dist/` regenerated.
**Predecessor:** `2026-07-04-chart-container-fill-sizing.md` §4, which fixed how
every SVG chart is *sized* and named the aspect question as the composition
decision it was not making. This note answers it — with "not worth it".
**Issue:** #680.

---

## 1. The two complaints, measured

> "renders tiny — roughly a quarter of the available width, floating in empty
> canvas — with quadrant titles and point labels illegible at presentation size"

Both hold up, and they are independent:

| claim | measured | verdict |
|---|---|---|
| ~a quarter of the width | 390px painted inside an 896px box = **44%** | true |
| labels illegible | item labels 8.5 units → **~11.8px on a 1920-wide slide** (~0.6% of slide width; body is ~26px) | true, and a judgment call |

And one thing the ticket did NOT say, which matters: **the CSS is not the bug.**
Measured in the real print-media DOM, `.chart-body`'s content box and the
`.quadrant-svg` border box are both 896 × 323.3px — the SVG fills its container
exactly. The shrinkage happens one level down, where `preserveAspectRatio`
defaults to `xMidYMid meet` and fits a 420×348 (1.21:1) viewBox into a ~2.5:1
box. The `max-height: 50cqh` on the base rule is a red herring: the engine stamps
`form` on the section, so the in-form container-fill rule is what applies.

## 2. Why the width complaint is not a defect

The unit's aspect is the whole story, and the family splits on one thing —
whether the viewBox carries a key beside the diagram:

| chart | viewBox | aspect | fill of ITS OWN chart-body |
|---|---|---|---|
| radar | 667×332 | 2.01:1 | ~81% (in a 896 × 359.7 box) |
| piechart | 377×200 | 1.89:1 | ~68% (in a 896 × 323.3 box) |
| quadrant | 420×348 | 1.21:1 | ~44% (in a 896 × 323.3 box) |

Note the boxes are not identical — radar's chart-body is taller, so these are
each chart in its own container, not a controlled comparison. Normalized to one
323.3-tall box radar fills ~72.5%; the ordering and the conclusion are unchanged,
but do not read the column as a like-for-like ratio.

Pie and radar are not better *sized*; they are better *shaped*, and their key is
what shapes them. A keyless, roughly-square unit in a wide-short stage
letterboxes — that is arithmetic, not a bug. Closing it means changing what the
chart IS, and both ways of doing that were built and rejected (§3).

So the horizontal margins stay. They are the same margins a pie leaves; the
quadrant just leaves more of them.

## 3. Two rejected designs, kept here so they are not retried

**(a) Buy the width with plot — 420×348 → 840×348.** Fills ~87% of the box.
Rejected on sight: the plot becomes 756×244, so each quadrant cell is ~3:1, and a
2×2 grid of flat rectangles does not read as a quadrant — it reads as a chart
that has been stretched. It also cost 4:3 decks 23% of their painted area (an 840
unit is width-bound in a 1.5:1 box) and roughly halved portrait and mobile, which
would have needed a second geometry to repair.

**(b) The pie's answer — square plot + SVG-native key rail.** Plot 244×244,
composing to ~670×348 = 1.93:1 against pie's 1.89:1; fills the box, genuinely
square, key labels at ~21.8px, and it fixed the 4:3 case for free. Rejected for
what it costs the reader: the names leave the plot, so every point becomes a
numbered dot and reading the chart becomes a lookup. A quadrant's payload is
*which item sits where*, and a name beside its dot delivers that directly.
(An earlier draft cited `cohort` as the precedent for this trade. It is not:
`cohort` names its clusters at their centroids INSIDE the plot and its key rail
carries counts, not identities, so it never asks the reader to look anything up.
No variant in the library does today — design (b) would have been the first.)

Both were rendered and reviewed before being dropped. Neither is a bad design;
they are answers to a question this component should not be asked.

## 4. What shipped: the type, and nothing else

The legibility half is fixable without touching the geometry, so that is all that
changed. Item labels **8.5 → 9.5 units** (~11.8px → ~13.2px at 1920, +12%), with
`LW.item` 104 → 120. Alongside: quadrant names 11 → 12 (and `LW.corner` 120 → 140
with them, or a two-word group name ellipsizes at `maxLines: 2`), magic 12 → 13,
zone 10.5 → 11.5, cohort 11 → 12, axis 12 → 14, ticks 10 → 12, target badge
9 → 10. `bubbleValue` deliberately stayed at 8.5 — it is painted INSIDE its
bubble, whose radius is the data, so a bigger numeral overflows the small end of
the scale rather than reading better.

**The ceiling is set by the corpus, not by the fixtures, and getting that wrong
shipped a defect.** An earlier pass stopped at 10.5 because both dense fixtures in
`quadrant.test.js` still placed every name. They are 5- and 6-point clusters. The
gallery's own slide titled *"Stress test — fourteen initiatives, dense labels, one
owner"* — footed *"the ceiling"* — is denser than either, and at 10.5 `placeLabels`
silently dropped `Per-decision profiles`, which then shipped inside the committed
`quadrant.gallery.light.pdf`. Swept across every quadrant slide in the repo,
88 items:

| `FS.dotLabel` / `LW.item` | labels emitted | wrapped to 2+ lines |
|---|---|---|
| 8.5 / 104 (before) | 88 of 88 | 28 |
| **9.5 / 120 (ships)** | **88 of 88** | **17** |
| 10 / 120 | 83 of 88 | 23 |
| 10.5 / 120 | 83 of 88 | 39 |

9.5/120 dominates both the old constants and the 10.5 attempt: bigger type, no
name lost, and fewer wrapped lines than the code it replaces. `charBudget()` is
`floor(width / (fontSize × 0.6))`, so it gives 21 characters a line against the
old 20 — an earlier draft of this note claimed 120 "keeps the original ~19" and
that names would "wrap no more"; the original was 20, and at 10.5 the budget fell
to 19, so names wrapped *more*. Corrected here rather than quietly.

**Validate a change to these constants against the corpus.** The fixtures are a
floor, not a ceiling, and the near-miss is now on the record twice: an even
earlier estimate of "12 is fine" came from checking only the 8-item gallery deck.

## 5. Verification

Real renders through `lattice-emulator.js` at 140 DPI, before and after at
identical scale, plus the DOM box probe in §1 under print media. Gates: `lint`,
the unit suite, `build:check` green. The mirror gate
(`svg-label-css-mirror.test.js`) holds the kernel's `FS` and the stylesheet
together — it covered 6 of the 9 keys, and two that MOVED in this change
(`labelMagic`, `labelZone`) were among the ungated three, as was the second rule
mirroring `dotLabel` (`.quadrant-bubble-label`). All four are now in the gate;
they held here on discipline, which is not a mechanism.

This note and the constants it describes were reviewed by the adversarial trio
(HARD RULE #25). The dropped-label defect in §4, the wrap-budget arithmetic, and
the fill-table caveat above were all found there, not by the maker.

**Not verified:** non-`indaco` palettes were not swept (font sizes are
palette-independent, and no theme overrides the two quadrant size tokens — but
that is reasoning, not a render); `claim-hero` / `claim-bleed` quadrants keep
their own sizing rules and were not re-rendered.
