---
origin: 2311
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2311#issuecomment-5781317701
---

# progress: pill and bar disagree on pilot/decision

Backfilled verbatim from the continuation brief on #2311 (merged 2026-09-22).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P2 · [no ticket] progress: pill and bar disagree on pilot/decision
       why now   — same class of contradiction, and #2311 had to DOCUMENT the
                    disagreement rather than fix it
       where     — lib/components/chart/progress/progress.styles.css:110-117 has
                    four arms (pass/warn/fail/deferred); no arm for pilot/decision,
                    so the bar stays --chart-cat-1-hue (:88) while .chart-status
                    goes info. Decide: add the fifth arm, or keep the documented
                    caveat in progress.manifest.json (slots description).
       done when — bar and pill agree, or the manifest states the split as intended
       evidence  — rasterized progress gallery slide, both modes, a `pilot` row
                    beside an `on-track` row
       verify    — tier 0 gates, because it is one CSS arm in one component
```
