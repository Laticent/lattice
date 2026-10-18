---
origin: 2770
priority: P2
recorded: 2026-10-18
area: chart
severity: low
swimlane: engineering/decisions/2026-09-07-chart-design-language.md
---

# `risk-matrix` and `tower` are not in the chart bucket gallery, so the render census cannot see them

```text
  P2 · [no ticket] Two chart members have a manifest but no slide in lib/components/chart/chart.gallery.md.
       why now   — the same gap #2770 closed for histogram and ep-curve: both census checks render only that
                   gallery, so these two marks are measured by no render check.
       where     — lib/components/chart/chart.gallery.md (26 slides; 28 chart manifests). Graduate each in
                   its own post-review commit (HARD RULE #8); bump the cover count on the first slide.
       done when — node tools/chart-structure-census.js --check and node tools/chart-language-census.js --check
                   both name risk-matrix and tower marks, and are green (fix or record any finding they print).
       evidence  — the census check output before and after; the two slides rendered light and dark.
       verify    — tier 0: rerun both census checks, then look at the rendered slides.
```
