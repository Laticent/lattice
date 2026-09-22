---
origin: 2238
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2238#issuecomment-5752514215
backfill: true
---

# Drive the detail reveal in PRESENT on a touch context

Backfilled verbatim from the continuation brief on #2238 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Drive the detail reveal in PRESENT on a touch context
       why now   — the only live surface #2238 reaches that nobody has driven, and the
                   sole caveat left on its pre-merge card
       where     — docs/src/components/studio/PresentOverlay.tsx mounts ChartDetailLayer
                   in PINNED mode (hoverAny=false); docs/src/playground/chart-interact.js
                   `COARSE` binds pointerdown, not pointermove, so the desktop helper in
                   chart-detail-reveal.spec.ts will NOT reveal as-is. The wrapper rule is
                   scoped `@media (pointer: fine)` precisely so coarse is unaffected —
                   that reasoning is what needs exercising.
       done when — a tap on an annotated cell opens the card in Present on a touch
                   project, AND a tap on the card's overhang does not advance the slide
       evidence  — a passing arm in the touch projects (tag it `@parity`), plus a
                   screenshot from the real Present overlay
       verify    — tier 0 gates, because it adds coverage rather than changing the shared
                   layer; escalate to tier 1 only if a chart-interact.js fix proves needed
```
