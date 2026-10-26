---
origin: 2887
priority: P2
recorded: 2026-10-26
area: chart
severity: low
swimlane: tools/build-marks-css.js
source: https://github.com/Laticent/lattice/pull/2887
---

# What tone is for: three audit gaps left open for the owner

```text
  P2 · the etch and tone audit (2887) had five gaps; two are fixed, one is documented, three need a call
       why now   — the fixes that were mechanical shipped with the token swaps. What remains is one question,
                   "what is tone for", and it is the owner's: any answer changes how every tone deck looks.
       where     — tools/build-marks-css.js (F.tone, F.etch); tone-is-the-third-finish.md
       done when — the owner picks an option for each below, or accepts the default.
         A. Tone's text-bearing bodies step 0.016 OKLab L apart (tower, matrix-grid), under the 0.06 family
            floor. Now that tone's edges carry the category (fixed), a reader recovers a category from the
            edge. Default: accept, tone's body is value by design.
         B. Etch's heatmap runs 1.50-2.31:1 top step to empty (dark), tone 2.64-8.13:1 after widening. Default:
            etch stays a whisper (its identity); tone as shipped.
         C. Tone and pigment sit 0.045 apart on single-series charts on light, and tone's ramp now differs from
            pigment's by band only. Making tone more distinct means a visible redesign of tone.
            Default: leave.
         D. Etch's "letter" half (category names and values in the category ink) is not built; two of its four
            classes cannot be done on today's substrate (tone-is-the-third-finish.md § not built). Default:
            stays unbuilt.
       evidence  — .scratch probe in the PR body: per-chart closest-pair distance and heatmap span, before and after.
       verify    — chart-finish-reach --all-themes --check (arms SPAN, TEXT, RUNS).
```
