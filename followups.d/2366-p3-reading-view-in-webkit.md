---
origin: 2366
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2366
---

# Drive the Studio Reading view's chart paints in real WebKit

why now   — #2366's real-surface evidence for the Reading view deck sheet is Chromium only; it is
            the one gap between that PR's `high` confidence and `very high`.
where     — docs/e2e/studio-read-article-charts.spec.ts; playwright.config.ts's `webkit-phone`
            project (grep `@webkit-phone`).
done when — the spec runs green under WebKit (tag it `@webkit-phone`, or a WebKit arm of it), light
            and dark: no mostly-black chart, no bare status pill, no marker without its disc.
evidence  — the fence uses `:where()`, `:not(.lp-figure *)` and a css-tree rewrite; all are
            Selectors-4 features WebKit ships, but that is reasoning, not a run.
verify    — the spec's own run in the webkit-phone project, plus its screenshots at 390.
