---
origin: 2887
priority: P1
recorded: 2026-10-23
area: engine
severity: high
swimlane: lib/components/layout/columns/columns.docs.md
source: https://github.com/Laticent/lattice/pull/2887
---

# `columns ratio-40-60` with a chart pane crashes the render with "Invalid manifest"

```text
  P1 · `columns ratio-40-60` with a chart pane crashes the render
       why now   — a two-chart slide is the layout this PR designed for (at most two charts a
                   slide), and the ratio modifier on it takes the whole deck down, not one slide.
       where     — component resolution for the ratio-* modifier class inside `columns`: the
                   loader validates dist/styles/manifest.json as a component manifest ("name must
                   be a non-empty string", "function must be one of …", "unknown manifest key
                   'version'"), thrown from dist/lattice.js (the bundled manifest validator).
       done when — a `columns ratio-40-60` slide with `progress` and `bar` panes renders, and a
                   test renders that deck.
       evidence  — this deck crashes; the same deck without ` ratio-40-60` renders:
                     ---
                     theme: cuoio
                     ---
                     <!-- _class: columns ratio-40-60 -->
                     ## Two charts side by side.
                     <!-- _class: progress -->
                     - Signal intake `92%` `on-track`
                     <!-- _class: bar -->
                     - North America `3.1`
                   The columns gallery's own `ratio-40-60` slide (no chart panes) renders, so the
                   trigger is a ratio modifier together with chart panes.
       verify    — node dist/lattice.js <deck>.md out.pdf exits 0 and the PDF shows both panes at
                   40/60.
```

Off the path of #2887: found while building that PR's two-chart test slides, in component
resolution the PR does not touch. The session that found it saw the same crash on `main`
before this branch's chart work.
