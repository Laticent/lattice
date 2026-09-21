---
status: in-progress
summary: >-
  Every fit verdict in the engine is read against a 12px noise budget, so a slide that paints up
  to 12px outside a box that CROPS passes every channel while the pixels are gone. Measured on a
  probe deck: 12px prints nothing, 13px prints the frame warning. A sweep of all 335 shipped decks
  (4043 slides, real Chromium, each rendered as authored) says the window is not theoretical — 34
  slides across 21 decks sit in it, and 18 of those 34 are ones the truthful content probe calls a
  cut at zero tolerance. Across the whole corpus that probe finds 27 silent cuts, 26 of them BODY
  content rather than caption-footer chrome; this change names 18 and nine stay silent. The tolerance is NOT changed
  here: it feeds `buildSplitVerdict`, so lowering it re-decides autosplit corpus-wide and adds 34
  slides to a ratchet nobody has fixed. What changes is the SILENCE — the export now names the
  slides in the band and points at `check:chart-fit`, which adjudicates it with 1.5px of slack.
builds-on: 2026-07-30-slide-geometry-emitted-not-measured.md, 2026-09-08-overflow-corpus-caption-footer.md
---

# The fit tolerance has a 12px silent window, and now it says so

**Date** 2026-09-21 · **Issue** #2252 · **Status** In progress — window measured and
stated; the tolerance change itself is the owner's call, with the numbers below

## The claim under test

`lattice-emulator.js` reports a slide as clipped on one of two lines — `⚠ OVERFLOW` (content
exceeds the frame) or `⚠ CONTENT CLIPPED` (a bearer crossed a clipping box without exceeding the
frame). Several components cite the second as their whole enforcement story. `gantt` is the
sharpest case: it deliberately declares no machine-readable `capacity` block, because the schema
requires `capacity.axis` and an axis enrolls a component in an auto-split it provably does not do
(`splitFactsFor`, `lib/core/split-facts.js:411` — seven lanes at portrait with `autosplit: on`
render one clipped page). Its budget lives in prose and its enforcement is the render.

If the render has a silent window, the budget has a silent window.

## What was measured

**The boundary, on a probe deck.** Thirteen gantt slides, each forced a known number of px past
`.cell-stage` by one `min-height` rule per slide, rendered through the real emulator:

| forced overshoot | 0 | 2 | 4 | 6 | 8 | 10 | 11 | **12** | **13** | 14 | 16 | 20 | 24 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| reported before this change | — | — | — | — | — | — | — | **—** | **⚠** | ⚠ | ⚠ | ⚠ | ⚠ |

The boundary is exactly the tolerance: **12px silent, 13px reported**. That matches #2252's
independent finding (`-18.6px` reported, `-10.2px` not) and its live instance — a gantt painting
10.2px outside a stage that is `overflow: clip`.

**The window, across the shipped corpus.** Every deck the `overflow:check` glob covers — 335
decks, 4043 slides — real Chromium, each slide probed at tolerances 0 · 1 · 2 · 3 · 4 · 6 · 8 · 12
in one render. Of the 4013 slides the export says nothing about today:

| excess past the frame | slides |
|---|---|
| 0 | 3955 |
| (0, 1] | 6 |
| (1, 2] | 16 |
| (2, 3] | 2 |
| (3, 4] | 3 |
| (4, 6] | 17 |
| (6, 8] | 2 |
| (8, 12] | 12 |
| **(3, 12] total** | **34** |

The `(0, 2]` band is mostly phantom, and it is worth naming why, because it is what the tolerance is
genuinely for: **14 of the 16 slides in `(1, 2]` are the same `split-panel metric` slide**, all at
exactly 2px — 13 of them the same page 8 across the `token-contrast` decks, the 14th that layout's
own gallery page. `probeContentClipped` answers `cut: false` on 19 of the 22 slides in `(0, 2]` — which is *not*
the same as "no ink outside a box", and the difference is the next paragraph's whole point: 5 of
those 19 do paint outside `.cell-stage` (up to 1.75px on `examples/marker-corner.md` p2) without
losing a bearer across the edge.
Above 3, the measured ink tracks the number: excess 4 → 4.02px of a `<strong>` outside its box,
6 → 5.58, 11 → 10.64, and 18 of the 34 come back `cut: true`.

**THE FLOOR IS NOT A CLAIM THAT NOTHING IS LOST BELOW IT**, and the first draft of this note said
it was: *"probeContentClipped answers `cut: false` on every slide in that band."* Its own dataset
refutes that. Three slides in `(0, 2]` lose author body content:

| deck | page | excess | first cut |
|---|---|---|---|
| `inventory/list/list.gallery.md` | 9 | 1 | `"A stress line may spend twenty words, an…"` |
| `legal/legal.gallery.md` | 25 | **0.02** | `"Added"` |
| `legal/regulatory-update/regulatory-update.gallery.md` | 6 | **0.03** | `"Added"` |

Two of them at three hundredths of a pixel. That is not a flaw in the floor — it is the point
`probeContentClipped` exists to make: a formatter-truncated line crosses a box edge without moving
the section's scroll height at all, so **section excess is uncorrelated with loss at the low end**
and no floor on it can be a completeness claim.

**WHAT THE ADVISORY BUYS, AND WHAT IT DOES NOT.** Of the 27 slides the truthful probe calls a
silent cut, this change names **18**. **Nine stay silent, eight of them body content** — and lowering
the floor would not reach them, because six sit at excess 0:

| deck | page | excess | first cut |
|---|---|---|---|
| `examples/adaptive-sweep.md` | 72 | 0 | `"92%"` |
| `examples/chart-family-coverage.md` | 4 | 0 | `"1"` |
| `examples/gallery-jargon.md` | 35 | 0 | `"Examiner export"` |
| `examples/legend-below-portrait.md` | 8 | 0 | *(chrome)* |
| `chart/journey/journey.gallery.md` | 4 | 0 | `"1"` |
| `progression/cycle/cycle.gallery.md` | 3 | 0 | `"Sedimentation"` |
| `inventory/list/list.gallery.md` | 9 | 1 | `"A stress line may spend twenty words, an…"` |
| `legal/legal.gallery.md` | 25 | 0.02 | `"Added"` |
| `legal/regulatory-update/regulatory-update.gallery.md` | 6 | 0.03 | `"Added"` |

*(A tenth was in the sweep and is not in this list: `examples/gantt-status-key.md` p4, this
branch's own demo deck. The content probe called it a cut in the authored frame at section excess
**0** — the chart SVG crossed a box edge without moving the scroll height at all, the same
uncorrelation the three-row table above makes — and `check-chart-fit` put it **11.2px** past
`.cell-stage` at portrait. Repacking one lane from three sub-rows to two closed both, and the deck
was re-probed to confirm it. That is why the totals here read 27 / nine / six rather than the
28 / ten / seven the raw sweep recorded. HARD RULE #18: a window this branch created, closed
rather than logged.)*

Reaching those nine needs the CONTENT probe run on every slide rather than only on the ones the
cheap probe marks suspect — an order of magnitude dearer, and its own change. Recorded in Open.

**These two tables are the durable form of the claim.** `.scratch/` is gitignored and
`npm run clean:scratch` wipes it, so a reader six months from now cannot re-run the analysis
scripts; they can check these named slides against the repo.

**ONE MEASURE, NOT TWO.** An earlier draft of this table was wrong in a way worth recording,
because it is the same failure the note is about. Its buckets were computed as
`max(scrollH − clientH, worst cell dy/dx)` while its `(3, 12]` headline used `scrollH − clientH`
alone — so the histogram did not sum to its own total and the phantom band read 26 instead of 22.
The advisory reads the vertical excess only, so that is the measure the whole table uses now.

**Two decks entered after the sweep ran, AND THE TABLE ABOVE ALREADY FOLDS THEM IN.** `#2249`
renamed `compare-table` to `table` and added `examples/table-component.md` while this branch was
open. Both were swept separately and are entirely clean — 0 reported, 0 in the band, 0 cuts — as
were the 8 slides of the deck the rename replaced. So no bucket but the first one moves: the raw
sweep covered 334 decks / 4026 slides with 3938 at zero, and 334 − 1 + 2 = 335 decks,
4026 − 8 + 8 + 17 = 4043 slides, 3938 − 8 + 8 + 17 = 3955 at zero. **Quote the folded numbers or
the swept ones, never one of each** — a later pass "corrected" the table back to the raw sweep and
left it contradicting this paragraph four screens below.

**MEASURE THE DECK AS AUTHORED.** The first version of this sweep normalized every deck's front
matter to a landscape frame, which strips a deck's own `size:` and `autosplit:` — a different
layout from the one the export renders, and its px numbers were up to 4x off (the baseline
gallery's p94 read 2px normalized and 9px as authored). The emulator's own advisory, which reads
the same probe on the real export render, is what settled it: the two agree to the decimal once
the deck is left alone. Any re-measurement has to render decks unmodified.

**How much of it is real loss.** Asking the truthful probe (`probeContentClipped` at zero
tolerance) which of the silent slides actually lose a bearer across a box edge: **27 slides across
20 decks, and 26 of them are author body content** — only one is the caption-footer chrome that
`2026-09-08-overflow-corpus-caption-footer.md` is about. A sample, with what the probe names as
the first thing cut:

| deck | page | first cut |
|---|---|---|
| `legal/authority-chain/authority-chain.gallery.md` | 2, 5, 7, 8, 10 | `"$245M consent order — operationalized …"` |
| `test/integration/baseline-decks/gallery.md` | 80, 100 | `"Exec dashboard, unrequested"` · `"Signals purge at 24 months; the decision…"` |
| `examples/contrast-floor-dimming.md` | 5 | `"Palette tune,"` |
| `inventory/actors/actors.gallery.md` | 3 | `"Row one"` |
| `anchor/topic/topic.gallery.md` | 5 | `"An anchor is deletable without losing in…"` |
| `examples/qa-component-jank.md` | 2 | `"One executive, reporting monthly."` |

This is the opposite shape from the one `2026-09-08-overflow-corpus-caption-footer.md` found. That
note's 19 slides were all `chromeOnly: true` — the designed ellipsis on a running footer, nothing
an author wrote. These are 26 body cuts against 1 chrome one.

## Why the tolerance is not changed here

A tolerance of 4 would report 18 of the 27. It is the number the distribution argues for, and the
original justification for 12 — "the smallest real bug observed in the gallery was a 211px
overshoot" — has been false for long enough that nobody re-derived it.

Three things make lowering it a change of its own rather than a constant edit:

1. **It is not only a report threshold.** `buildSplitVerdict` takes the same `tol`, so the
   constant decides which slides AUTOSPLIT. Lowering it re-decides that across the corpus, which
   moves committed PDFs and the page-count assertions the integration tier asserts.
2. **It adds 34 slides to `overflow:check`'s ratchet**, none of them fixed. Banking them is
   precisely the move `2026-09-08` refused for a smaller number, and fixing them is a **21-deck**
   remediation — 20 of those decks are not reported at all today — with no relation to whatever
   branch happens to be touching the constant. (An earlier draft said "18-deck"; 18 is the SLIDE
   count of the band's real cuts, carried into a deck slot.)
3. **The 27 are pre-existing and off-path** for the branch that found them (HARD RULE #18), so
   they are logged here rather than pulled into a diff about gantt geometry.

## What changed instead

**The window is stated.** After the two warning lines, the export now prints, for the slides that
fall in `(NEAR_MISS_FLOOR, FRAME_TOLERANCE]` and are on neither list:

```
  ⓘ INSIDE THE FIT TOLERANCE — 6 slides paint past a box that crops by less than the 12px budget
    every check above is read against, so nothing reports them: p3 (4px), p4 (6px), … p8 (12px).
    That box clips, so the pixels are gone from the export either way. Check those slides by eye,
    or run `npm run check:chart-fit -- <deck>` — it measures the painted box against the stage
    rather than asking this report, and its slack is 1.5px.
```

It is an ADVISORY and deliberately not a verdict: no class is stamped, no export marker is drawn,
the exit code does not move, and the ratchet is untouched — measured, not assumed: a full
`check-overflow-corpus` sweep of the shipped tree reports exactly one deck above its baseline,
`heatmap.gallery.md` p3/p4, which is #2254 and is equally red on `main`. (The commit that first
made this claim asserted it before that sweep had finished. The sweep has since run and the claim
holds; recorded because asserting it early is the failure this note is about.) It follows the file's own `ⓘ TYPE FLOOR
NOT MEASURED` precedent — "not measured" is an honest answer, a quiet pass is not (HARD RULE #23).

**`NEAR_MISS_FLOOR = 3` is taken from the distribution above**, not from taste. It costs an
advisory on 34 slides across 21 of 335 decks — 6.3% of the corpus. The advisory reads the
VERTICAL excess (`scrollH - clientH`) off the probe call the export already makes, so it adds no
measurement: `scrollH` and `clientH` are not gated by the tolerance, which only decides `over`,
`overCells` and `clipSuspect`. An earlier cut probed a second time at zero tolerance and bought
nothing.

**The tolerance is one constant now.** `FRAME_TOLERANCE` in `lib/core/overflow-probe.js`, read by
the emulator's three sites and the runtime's one (HARD RULE #1). It was a bare `12` written out
four times with the reasoning — the stale reasoning — in one of them.

**`gantt`'s capacity prose says what its enforcement cannot see** and names `check:chart-fit` as
the gate that can. Both citations in `gantt.manifest.json` carry it; the docs and gallery are
generated from there.

## Wording is load-bearing, and there is a test for it

`tools/check-overflow-corpus.js` harvests a deck's clipped pages by running
`/OVERFLOW[^\n]*?pages? ([\d,\s]+)/` and its `CONTENT CLIPPED` twin over the whole output buffer
and taking the FIRST hit. The advisory prints page numbers too, so if it ever carried either
literal it would hijack the ratchet's page list corpus-wide.
**THREE tools harvest that buffer, not one**, and they do not agree on strictness:
`check-overflow-corpus.js` is line-bounded and case-SENSITIVE, `check-family-tiers.js` crosses
newlines, and `tools/lib/calibrate-core.js` crosses newlines AND ignores case. So a reword to a
lowercase "overflow" or to `page 3` instead of `p3` — both entirely natural — is harvestable even
though the corpus tool would miss it.

`test/unit/export/near-miss-advisory.test.js` pins all of it: the advisory carries none of the
tokens any of the three can key on, the three still grep for exactly what the test assumes (so the
first assertion cannot pass by guarding a literal nobody reads), the advisory still SAYS its thing
(every other assertion is negative, so silence would pass them all), and the export prints the
kernel's text rather than a copy.

**The TEXT lives in `lib/core/overflow-probe.js` (`formatNearMissAdvisory`), not in the export**,
and that relocation is what makes the test possible rather than a tidiness move. Two earlier cuts
failed: the first asserted only the case-sensitive literals; the second tried to render the
export's inline template literal by substituting every `${…}` for a digit, but the page marker sat
inside a NESTED literal, so the substitution swallowed the word beside it and `page ${o.slide}`
walked through a guard whose entire job was to stop it. A test that reads a format string cannot
see what the string renders to.

## Open

- **Lower `FRAME_TOLERANCE` to 4?** The distribution says yes; the 30-slide ratchet and the
  autosplit re-decision say it needs its own change. Owner's call.
- **The 27 real silent body cuts.** Logged above, unfixed, off-path.
- **The `(2, 3]` two.** Borderline: `guide-gestures.md` p2 measures 2.55px of ink outside its box
  and `probeContentClipped` still says `cut: false`. They sit below the floor, so they stay silent.
- **The horizontal axis.** The advisory measures vertical excess only, because the probe does not
  return the width pair. A slide spilling sideways inside the budget is still silent.
- **The nine body cuts at excess ≤ 3**, named above. Reaching them means running the content probe
  on every slide rather than only on the ones the cheap probe marks suspect.
- **The advisory's second line states one mechanism, and `scrollH` has three.** It says "that box
  clips, so the pixels are gone", but `scrollH` can also be raised by `squeezed` — OVERPRINT, which
  crosses no box edge, and for which `check:chart-fit` is the wrong remedy. Raised by the HARD RULE
  #25 checker; not reproduced on a shipped deck (`examples/math-form-frame.md` p9 has
  `squeezed: 10` AND a matching `.cell-stage` overflow, so both mechanisms agree there). If a
  squeeze-only slide is ever found in the band, the line needs to say which mechanism it saw.
- **A `guards: strict` slide could be double-reported.** `verifyTrim` declares a trimmed slide
  clean at the same 12px tolerance, so a slide can be called fit AND land in this band, printing
  "those slides FIT because text was removed" beside "pN paints past a box that crops". Same
  checker; also not reproduced (`examples/overflow-guards.md` trims p2 and does not enter the
  band).

## Reproducing

The corpus figures come from a one-render-per-deck sweep that evaluates every tolerance in the
same page, rather than N corpus runs. It is not committed — it is a measurement, not a gate — but
the shape is three files under `.scratch/` driving `lattice-emulator.js`'s own sidecar HTML
through `probeSectionOverflow` / `probeContentClipped` at each tolerance. Re-derive with
`node tools/check-overflow-corpus.js --json` for the verdicts and the probes directly for the
numbers; the boundary half reproduces from a 13-slide deck in minutes.
