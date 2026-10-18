---
origin: 2767
priority: P2
recorded: 2026-10-18
area: chart
severity: low
swimlane: engineering/decisions/2026-09-07-chart-design-language.md
---

# The render census never sees histogram (or ep-curve) marks

```text
  P2 · [no ticket] `chart-structure-census.js --check` renders only the chart bucket gallery,
       and histogram and ep-curve are not in it yet.
       why now   — the #2767 checker pass: histogram-band moved onto the shared edge rule, and only
                   the text arms of chart-mark-edge-census.test.js guard that; the census that
                   measures the RENDERED stroke would not notice it slip.
       where     — node tools/chart-structure-census.js --check (it names 21 outline marks; no
                   histogram). Also seen there, pre-existing and untouched by #2767:
                   heatmap/heatmap-cell outlines with no vector-effect: non-scaling-stroke.
       done when — histogram and ep-curve graduate into the chart gallery in their own
                   post-review commit (HARD RULE #8), and the census lists their marks pinned;
                   the heatmap-cell finding is fixed or recorded as deliberate.
       evidence  — the census check output before and after.
       verify    — tier 0: rerun the census check.
```
