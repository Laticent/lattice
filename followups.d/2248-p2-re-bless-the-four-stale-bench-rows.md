---
origin: 2248
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2248#issuecomment-5753967687
---

# Re-bless the four stale bench rows

Backfilled verbatim from the continuation brief on #2248 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P2 · [no ticket] Re-bless the four stale bench rows
       why now   — `npm run bench:check` is RED on main and those rows have been recording
                   nothing: `charts` renders 23 slides against a blessed 22, and the CLI page
                   counts render 15/33/43 against a blessed 5/9/30. A ratchet already red
                   cannot catch the next regression.
       where     — test/benchmark/baseline.json, `npm run bench:bless`. `renderTier()` is
                   behind no flag, so --bless re-measures render+edit whatever else you pass;
                   decide deliberately which rows you ratchet and say which moved for
                   workload reasons versus machine reasons.
       done when — `bench:check` is clean on an unmodified tree.
       evidence  — the baseline diff + a clean `bench:check` run pasted in.
       verify    — tier 0 gates: it changes a recorded measurement, not code.
```
