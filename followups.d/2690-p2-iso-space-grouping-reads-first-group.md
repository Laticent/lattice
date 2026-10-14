---
origin: 2690
priority: P2
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §5
source: https://github.com/Laticent/lattice/pull/2690
---

# `1 234`, the ISO way to write 1234, plots as 1 on six charts

```text
  P2 · [no ticket] Read ISO space grouping, or refuse it, on every chart
       why now   — Measured by the chart authoring census: `isValuePill('1 234')` is false, so a nested row written the ISO way becomes mark detail, and `parseValue('1 234')` returns 1, so pie, funnel, map, radar, word-cloud and progress (which call `parseValue` without the guard) plot it as 1, silently. The same holds for U+00A0 and U+202F as the separator. The chart authoring model makes space grouping THE way to write a grouped number, so authors will be told to write the form that misplots today.
       where     — lib/core/chart-values.js (`parseValue`'s lenient fallback), docs/src/lib/segno/types.ts (`readNumber`), and the six transforms' `parseValue` calls.
       done when — phase 2's ISO reader reads `1 234`, with a space or either no-break space, as 1234 in both readers, or, sooner, `parseValue` refuses a space-grouped string instead of reading its first group; a unit test pins `1 234`, `1 234`, `1 234`.
       evidence  — the unit test, and a deck row `- A `1 234`` that plots at 1234 (or is refused with a lint finding), never at 1.
       verify    — tier 1 checker, because every chart reads numbers through this function.
```
