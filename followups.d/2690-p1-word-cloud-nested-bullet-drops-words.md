---
origin: 2690
priority: P1
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-census.md §4
source: https://github.com/Laticent/lattice/pull/2690
---

# One nested bullet under a word-cloud word collapses the cloud to that one word

```text
  P1 · [no ticket] Give word-cloud a nesting model, or refuse a nested row
       why now   — The chart authoring census found that word-cloud's `parseItems` reads its `<li>`s with a non-greedy regex and no nesting model. `- Alpha `5`` with one nested bullet under it, then `- Beta `3``, `- Gamma `2``, renders a one-word cloud (`data-count="1"`, weight 9 from the nested pill) and leaves Beta and Gamma as stray prose. No shipped deck nests under a word today, but the chart authoring model makes a `>` description under any list row normal, and a nested bullet is the old spelling of one.
       where     — lib/components/chart/word-cloud/word-cloud.transform.js (`parseItems` / `parseItem`, `findFirstUl`); lib/core/chart-narration.js `narrateWordCloud` (takes the FIRST pill where the transform takes the last).
       done when — a nested sublist under a word is mark detail (or a lint finding), every top-level word is drawn, and a unit test renders the three-word repro with `data-count="3"`.
       evidence  — the repro above before (`data-count="1"`) and after (`data-count="3"`).
       verify    — tier 0: a transform fix with its own render test.
```
