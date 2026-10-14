---
origin: 2686
priority: P3
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §5
source: https://github.com/Laticent/lattice/pull/2686
---

# `1.234,5` reads as 1.2345, a thousandfold misread of a German or French number

```text
  P3 · [no ticket] Stop guessing separators in the number reader
       why now   — Measured on 2026-10-14 with `readNumber` from `@laticent/segno/values`: `1.234,5` (EU for 1234.5) reads as 1.2345, and `12.000` (EU for twelve thousand) reads as 12. `normalizeSeparators` in docs/src/lib/segno/types.ts (:198, which `readNumber` uses first) and its copy in lib/core/chart-values.js guess from the string and ignore the deck's `lang:`, though types.ts:19 advertises `1.234,5` as supported. The chart authoring model replaces the guess with ISO input (point decimal, space grouping) and locale display, but until phase 2 lands a pasted EU table can misplot silently.
       where     — docs/src/lib/segno/types.ts (`normalizeSeparators`, :198), lib/core/chart-values.js (its fallback copy, `parseValue`).
       done when — either phase 2 of the chart authoring model ships ISO reading with a lint fix for pasted locale numbers, or, sooner, the both-separators case (`1.234,5`) is read by which separator comes last and a test pins it.
       evidence  — a unit test over `1.234,5`, `1,234.5`, `12.000`, `12,000`, `12 000`.
       verify    — tier 1 checker, because every chart reads numbers through this function.
```
