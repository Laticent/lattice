---
origin: 2770
priority: P3
recorded: 2026-10-18
area: chart
severity: low
swimlane: engineering/decisions/2026-06-19-chart-adaptive-sizing.md
---

# `check:chart-fit` measures landscape, portrait and square, never the strip family

```text
  P3 · [no ticket] No gate renders a chart at an aspect under 0.5 (the `strip` family, e.g. `--size mobile`, 1080x2340).
       why now   — #2770 changed timeline-list's tall/strip arm and could only check strip by hand (a 12-word title
                   rendered at --size mobile fits, light and dark). Any later tall/strip edit has the same blind spot.
       where     — tools/check-chart-fit.js SIZES (landscape, portrait, square); lib/adaptive/families.js (strip: 0..0.5).
       done when — either check-chart-fit gains a strip size and the fixture is green on it, or the gap is recorded as
                   deliberate in the tool's header. Adding a size changes what CI runs, so it is the owner's call.
       evidence  — check:chart-fit output at the new size; the cost in seconds per run.
       verify    — tier 1 checker: a new size reaches every chart slide in the fixture and can surface unrelated clips.
```
