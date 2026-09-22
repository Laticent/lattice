---
origin: 2219
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2219#issuecomment-5673123505
backfill: true
---

# Decide the fate of claude/overflow-probe-content-box (e39793a).

Backfilled verbatim from the continuation brief on #2219 (merged 2026-09-15).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Decide the fate of claude/overflow-probe-content-box (e39793a).
       why now   — it holds a measured NEGATIVE result that is worth keeping and
                   worth not re-attempting; today it is an orphan branch with no PR.
       where     — either open a docs-only PR landing
                   engineering/decisions/2026-09-14-a-reserved-band-is-not-an-
                   overflow-allowance.md on its own, or fold that record into P1's
                   PR and delete the branch. Recommend the latter — one PR, one
                   review.
       done when — the rejected-approach record is on main and the branch is gone.
       evidence  — the record renders and README.md's index row points at it.
       verify    — tier 0; docs only.
```
