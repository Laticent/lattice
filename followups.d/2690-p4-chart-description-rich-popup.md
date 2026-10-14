---
origin: 2690
priority: P4
recorded: 2026-10-14
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §3
source: https://github.com/Laticent/lattice/pull/2690
---

# A chart row's hover description shows plain text; the owner's bar is several lines with lists, pills and sparks

```text
  P4 · [no ticket] Make phase 2's `>` row description render rich Markdown in the popup
       why now   — The owner stated the requirement on 2026-10-14 while testing PR #2690: the popup shown on touch or hover over a chart mark supports multi-line information, including lists, pills and sparks. Today neither form does that: a nested-bullet detail (`- Germany` / `  - Hi, **bold**, `{LIVE, tag}`, `~{1 3 2 5}`` / `    - we`) reaches `<template class="chart-detail">` as flattened text ("Hi, bold and LIVE and … we us"), and an indented `>` is not read at all on 12 charts (it hides the row; `chart-row-quote-unread` now says so). The model note's §3 decision 5 already calls keeping Markdown "new work"; this pins the owner's acceptance bar for it.
       where     — lib/components/chart/_chart-family/mark-detail.js (`splitDetail`, `detailPayload`, `detailNote`), the chart readers that call them, the runtime that opens the popup, and phase 2's one reader (model note §10).
       done when — a `>` description under a chart row renders in the popup with its paragraphs, a nested list, a pill and a spark drawn as they are on the slide face, on screen; the print path keeps it as the speaker note in plain text; and `chart-row-quote-unread` is retired for every chart that reads the quote.
       evidence  — a Studio preview screenshot of the popup on a bar with that description, at 1440 and 390, and the demo deck's PDF note.
       verify    — tier 2 adversarial trio as part of phase 2, because it changes the shared chart kernel.
```
