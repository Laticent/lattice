---
origin: 2247
priority: P4
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2247#issuecomment-5761690751
backfill: true
---

# Rename `frameToggleSkip()` to match `SOVEREIGN_FRAMES`

Backfilled verbatim from the continuation brief on #2247 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P4 · [no ticket] Rename `frameToggleSkip()` to match `SOVEREIGN_FRAMES`
       why now   — it is the last symbol carrying the retired toggle's name; 24 call sites
                   across source, tests, a doc and a dated decision record.
       where     — lib/forms/index.js:608 and its callers (`git grep frameToggleSkip`).
                   Do NOT edit engineering/decisions/** — dated archive.
       done when — `git grep frameToggleSkip` is empty outside engineering/decisions/**.
       evidence  — the grep, before and after, in the PR body.
       verify    — tier 0 gates; mechanical rename, fully covered by the existing suites.
```
