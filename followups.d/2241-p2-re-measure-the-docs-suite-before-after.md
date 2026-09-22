---
origin: 2241
priority: P2
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2241#issuecomment-5752669968
backfill: true
---

# Re-measure the docs suite before/after on a second machine

Backfilled verbatim from the continuation brief on #2241 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P2 · [no ticket] Re-measure the docs suite before/after on a second machine
       why now   — the −8.3% is the LAST load-bearing number in the note still standing on a
                    single box. Both independent checkers declined to re-time (their hardware
                    differs materially), so the verdict is twice-verified and the headline
                    number is not.
       where     — `cd docs && npx vitest run`. The "before" is the tree with the 136
                    `// @vitest-environment node` docblocks stripped; the "after" is main.
                    Committed numbers are in the note's §Performance table.
       done when — four runs per arm on one machine, mean reported, and the note's table
                    updated with the second machine's figures beside the first.
       evidence  — the two run sets pasted into the PR body, plus the `environment` line from
                    the vitest summary for each arm (it halves, 180.57s → 90.22s on the
                    original box — that is the mechanism, not just the total).
       verify    — tier 0 gates, because it changes only a documented measurement, not code.
```
