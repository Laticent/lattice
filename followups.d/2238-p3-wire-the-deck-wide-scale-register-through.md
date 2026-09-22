---
origin: 2238
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2238#issuecomment-5752514215
backfill: true
---

# Wire the deck-wide `scale:` register through to chart transforms

Backfilled verbatim from the continuation brief on #2238 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Wire the deck-wide `scale:` register through to chart transforms
       why now   — label-set.js already parses the register block and it is tested; only
                   the plumbing is missing, so the construct is half-delivered
       where     — transformChartSection on BOTH render paths (a chart transform receives
                   {cls, classTokens, orientation, utils} and never sees front matter);
                   parseRegisterBlock in lib/core/label-set.js
       done when — `scale:` in front matter names bands deck-wide, both render paths agree
       evidence  — a demo deck slide rendered to PDF showing authored band words from
                   front matter alone
       verify    — tier 1 checker, because it changes a shared entry point on two paths
```
