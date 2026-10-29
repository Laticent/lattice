---
origin: 2887
priority: P2
recorded: 2026-10-26
area: chart
severity: medium
swimlane: tools/build-marks-css.js
source: https://github.com/Laticent/lattice/pull/2887
---

# Make every mark follow `marks:`, not only chart marks, and let `preset:` set it

```text
  P2 · the finishes are token swaps now, but only chart marks read them
       why now   — the token-swap PR (chart finishes as --finish-* values) shipped the mechanism and moved
                   every chart rule onto it. The owner's pick (2026-10-25) was that ONE key controls the look
                   of every mark on the deck, so a slide never shows two looks. Today a chart's status pill is
                   a pale wash under etch and tone while a checklist disc, a kpi pill or a roadmap disc on the
                   same slide stays solid.
       where     — the status components outside the chart family (checklist and verdict discs, kpi pills,
                   roadmap discs) and lib/core/deck-settings.js (`preset:`); tools/build-marks-css.js owns the
                   --finish-* values they would read.
       done when — a disc, pill or roadmap mark outside the chart family takes its level, edge and border from
                   the same --finish-* values as a chart mark, under all three finishes, and `preset:` can name
                   a `marks:` value like it names `finish:`.
       evidence  — a slide with a chart status pill beside a checklist disc under etch and tone, before and
                   after, light and dark.
       verify    — the 32-theme contrast sweep; the golden diff shows pigment unchanged.
```

Design first (CLAUDE.md, design-before-code): which non-chart marks join, and whether a status disc under
etch is a wash inside an ink edge like the chart pill, are visual decisions for the owner. The values to read
are already on the section (`--finish-status`, `--finish-edge`, `--finish-border`); the question is which
component stylesheets read them.
