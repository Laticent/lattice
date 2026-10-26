---
origin: 2887
priority: P2
recorded: 2026-10-23
area: chart
severity: low
swimlane: lib/components/chart/state-chart/state-chart.docs.md
source: https://github.com/Laticent/lattice/pull/2887
---

# A curved state chart's self-loop arrowhead lands on its own label

```text
  P2 · curved state-chart self-loop overprints its label
       why now   — the render warns "CHART LABELS OVERPRINT … page 6: first 'revise'" on the
                   state-chart gallery, and the arrowhead sits inside the word.
       where     — the curved router's self-loop and its label placement (state-chart `curved`,
                   lib/components/chart/state-chart/state-chart.layout.js and the shared graph
                   router); not the tile paint.
       done when — the gallery's `curved` slide renders with no overprint warning, and the
                   self-loop's label sits clear of its own arrow.
       evidence  — `main`'s committed lib/components/chart/state-chart/state-chart.gallery.light.pdf
                   page 6 shows the arrowhead inside "revise"; the same holds on #2887.
       verify    — node dist/lattice.js the state-chart gallery prints no OVERPRINT warning.
```

Off the path of #2887: the PR changes tile paint (fills, marks, signal rings), not routing or
label placement, and the overprint predates it.
