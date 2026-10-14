---
origin: 2686
priority: P2
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §8
source: https://github.com/Laticent/lattice/pull/2686
---

# A `>` written at column 0 under a flowchart node ends the list and silently drops the next node

```text
  P2 · [no ticket] Lint a blockquote between chart list items that is not indented under one
       why now   — The adversarial trio on #2686 found that a `>` detail line written at column 0 (not indented under its item) makes markdown-it close the list. On a flowchart the next row ("End") becomes a plain `<li>`, not a node, and `lint:deck` says nothing. The chart authoring model makes the `>` blockquote the description form for every chart list, so the same mistake will spread unless it is caught.
       where     — lib/core/flowchart-grammar.js (blockquote detail, around :815-834), lib/components/chart/flowchart/flowchart.transform.js (:99-112), lib/components/chart/state-chart/state-chart.transform.js (:125-140), lib/authoring/lint-core.js (the new rule).
       done when — `lint:deck` warns, with a fix that indents the line, when a blockquote sits between two items of a chart list without being indented under the first; a flowchart and a state-chart case are in the lint tests.
       evidence  — the red team's repro deck (a flowchart with a column-0 `>` before its last row) renders the dropped node today and warns after.
       verify    — tier 0: a lint rule, covered by its own tests.
```
