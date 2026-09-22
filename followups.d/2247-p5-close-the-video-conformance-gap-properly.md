---
origin: 2247
priority: P5
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2247#issuecomment-5761690751
backfill: true
---

# Close the `video` conformance gap properly

Backfilled verbatim from the continuation brief on #2247 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P5 · [no ticket] Close the `video` conformance gap properly
       why now   — it is the one non-sovereign component that composes as Form with no Cell.
       where     — lib/components/imagery/video/, and the pin in
                   test/unit/forms/stage-catalog.test.js:127.
       done when — video materializes .cell-stage AND the `companion` variant still renders
                   side-by-side with an unclipped caption.
       evidence  — the 10-page video gallery rendered, both moods, viewed — not just green.
       verify    — tier 1 checker, because both obvious fixes were already tried and both
                   regressed the layout; a second pair of eyes is what a third attempt owes.
```
