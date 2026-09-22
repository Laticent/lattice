---
origin: 2311
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2311#issuecomment-5781317701
backfill: true
---

# kanban accepts a status word it then cannot paint

Backfilled verbatim from the continuation brief on #2311 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] kanban accepts a status word it then cannot paint
       why now   — it silently contradicts the vocabulary #2311 just published;
                    an author gets a wrong render for a keyword the code accepted
       where     — lib/components/chart/kanban/kanban.transform.js:76 gates on
                    CHART_STATUS.includes(...toLowerCase()) but :77/:88/:94 stamp
                    the ORIGINAL case, so `AT-RISK` passes the gate and matches
                    neither .kanban-card[data-s="at-risk"] (kanban.styles.css:192)
                    nor .chart-status[data-s="at-risk"]. Also check :100, which
                    stamps the card wrapper from the same variable.
       done when — a mixed-case status word either tints correctly or is rejected;
                    pick one and say which in the PR. Gate and stamp agree.
       evidence  — rasterized kanban gallery PDF (light AND dark) showing a
                    mixed-case status tinting the card and pill, via SendUserFile
       verify    — tier 1 checker, because it is an engine transform whose output
                    three render paths consume
```
