---
origin: 2311
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2311#issuecomment-5781317701
backfill: true
---

# render-verify the three non-pill status positions

Backfilled verbatim from the continuation brief on #2311 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] render-verify the three non-pill status positions
       why now   — closes the last claim on the shipped page still resting on
                    source reading rather than an artifact (the #2311 card's
                    named raise-path)
       where     — docs/src/content/docs/guides/pills.mdx § "Where the status word
                    goes" — the gantt / state-chart / slope rows. Their slots are
                    gantt.transform.js:416, state-chart.transform.js:333,
                    slope.transform.js:64.
       done when — a deck exercising all three confirms the documented position,
                    or the table is corrected
       evidence  — the rendered deck via SendUserFile
       verify    — tier 0 gates, because it is a docs claim with no code change
```
