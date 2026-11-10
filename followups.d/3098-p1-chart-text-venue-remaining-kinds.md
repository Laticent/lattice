---
origin: 3098
priority: P1
recorded: 2026-11-10
area: chart
severity: high
swimlane: engineering/typography.md §7
deferred: large — reaching the floor without costing a label needs layout work per kind (axes that wrap instead of thinning, keys that stack instead of widening, a 5×5 grid with a fixed key column, a node layout, a word packer) and a box model for portrait, square, 4:3 and panes; each is a layout change with its own visual review
---

# Chart text follows the venue: the kinds that do not take the factor yet

why now   — `lib/transformers/chart-text-venue.js` makes chart text grow with the venue toward 8′ of x-height at the back row (10.1 / 15.1 / 20.1 / 26.8 px at laptop / huddle / conference / hall), behind a guard that never lets the factor cost a label (no new "…", no dropped label, no smaller unit; `keepsEveryLabel`). Bar, funnel and heatmap clear the floor at every venue (`test/integration/components/chart-text-venue.test.js`). Everything below is still short of it. Nothing prints smaller than it did before the change: `test/integration/components/chart-text-venue-regressions.test.js` pins that for every gallery slide of the factor-taking kinds at four venues and four slide sizes.

where     — the guard and the factor in `lib/transformers/chart-frame.js` and `chart-text-venue.js`; each kind's transform under `lib/plugins/chart-family/kinds/`. The shared pieces: `ctx.textScale` / `ctx.textCanvas`, `cart.viewFor(orientation, paneView, textScale, textCanvas)`, the Cartesian key's `fontScale: ctx.textScale`, `fitKeyToPane({ venue: true })` and the `'wide'` key rail, the cap `MAX_TEXT_SCALE` (2.5).

Smallest chart text on each kind's default gallery slide, landscape, px, before → after (cuoio, header + meta + footer):

| Kind | huddle | conference | hall | What binds |
|---|---|---|---|---|
| waterfall | 15.9 → 19.0 | 15.4 → 25.1 | 12.1 → 25.7 | takes the factor; at hall the full factor thins a label, so the guard settles one step lower |
| stacked-bar | 13.9 → 16.6 | 13.4 → 22.1 | 12.7 → 25.2 | takes the factor; its key now keeps its laptop type size, which makes the drawing wider, and the guard settles a step lower at hall |
| ep-curve | 13.9 → 16.8 | 13.4 → 22.5 | 12.7 → 26.4 | takes the factor; the full factor drops a return-period label at hall |
| line | 16.9 → 22.8 | 14.4 → 17.4 | 13.7 → 19.0 | takes the factor; the full factor thins the quarter names at conference and hall, so the guard falls back to a quarter of it |
| histogram | 13.9 → 16.8 | 13.4 → 20.4 | 12.7 → 17.4 | takes the factor; from 1.72 up a bin label is cut to "…" at hall |
| scatter | 10.8 → 13.7 | 10.0 → 16.6 | 8.8 → 12.2 | takes the factor; the guard steps it down (long title and subtitle; the 6.5-unit axis title is the family's smallest text) |
| piechart | 16.6 → 24.8 | 13.6 | 9.1 | its larger key fit binds on width at conference and hall, so the guard keeps the old drawing |
| map | 16.7 | 16.7 | 16.7 | the larger key fit binds on width; old drawing kept |
| radar | 10.4 | 10.0 | 9.6 | same; old drawing kept |
| tower | 12.9 | 12.2 | 10.2 | opted out: on a venue canvas its key shrank (14.8 → 14.2) and a label overlapped |
| quadrant | 10.6 | 8.3 | 7.3 | opted out: the cohort key fit shrank its key (16.0 → 13.0 at conference); the default quadrant draws a fixed 420 × 348 |
| bullet | 14.8 | 14.3 | 11.3 | opted out: its rows printed over the next row's track |
| slope | 15.7 | 13.4 | 12.7 | opted out: its two value columns collapsed and the year headers printed over the values |
| risk-matrix | 11.9 | 11.3 | 10.4 | opted out: its fixed tick column, key and axis rows collapse the cells and drop the key labels |
| state-chart | 12.9 | 11.0 | 7.9 | a node layout sized from the text; not wired |
| hub-spoke | 19.5 | 18.9 | 13.4 | fixed 544 × 200 geometry; not wired |
| gantt | 20.4 | 20.4 | 20.4 | fixed 480 × 123, width-limited; not wired |
| flowchart | 12.5 | 12.5 | 12.5 | node layout, width-limited; not wired |
| word-cloud | 16.8 | 16.8 | 16.8 | fixed 1100 × 320 packer; word size encodes weight; not wired |
| roadmap (HTML) | 11.4 | 14.8 | 19.3 | the date pill reads the inline pill size, not a label role |
| portrait, square and 4:3 slides, every kind | — | — | — | factor 1: the box model is landscape-only; with the factor, text overlapped and left the slide (ep-curve at 4:3 hall, pie donut at portrait hall) |
| any kind in a pane | — | — | — | factor 1: a pane canvas divided by the factor cut category names (`examples/pane-layouts.md` at hall: "Licenses", "Services", "Training") |

done when — every kind above, portrait / square / 4:3 slides and a chart in a pane join `COVERED` in `test/integration/components/chart-text-venue.test.js` (the smallest chart text clears the venue floor at all four venues) while `chart-text-venue-regressions.test.js` stays green for them (no smaller text, no lost name, no new overlap, nothing off the slide).

evidence  — the measure is the integration test's own (font size × screen matrix, normalized to 1280 px); the before/after table and the hall renders are in the PR that added `lib/transformers/chart-text-venue.js`.

verify    — tier 2: maker-checker per kind (each is a layout change); renders of that kind's gallery at all four venues, light and dark.
