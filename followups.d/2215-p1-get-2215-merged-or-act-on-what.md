---
origin: 2215
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2215#issuecomment-5672461887
backfill: true
---

# Get #2215 merged, or act on what the human says instead.

Backfilled verbatim from the continuation brief on #2215 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Get #2215 merged, or act on what the human says instead.
       why now   — everything else in this swimlane sits on it. DOR_CUTOFF,
                   tools/audit-queue-dor.js and the needs:definition + feedback
                   labels exist ONLY on that branch; none is on main.
       where     — PR #2215; the 🚦 card is posted on it and states what is unverified.
       done when — merged (squash), local main synced, or the human has redirected.
       evidence  — after merge, watch the FIRST real needs:definition flag land from
                   a genuine Actions run. That is the one thing the pre-merge card
                   names as unreachable before merge, so capture it: the run id, the
                   label, the comment.
       verify    — tier 0 gates; the merge itself is the human's gate.
```
