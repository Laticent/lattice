---
origin: 2298
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2298#issuecomment-5769382037
backfill: true
---

# Reconcile a contradiction in engineering/house-style.md §1.

Backfilled verbatim from the continuation brief on #2298 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Reconcile a contradiction in engineering/house-style.md §1.
       why now   — it says the two us-english-stem-audit arms "do block", while
                   its own enforcement table calls the commit-msg check "the only
                   automated check left". Both predate #2298; one is wrong.
       where     — engineering/house-style.md §1 and its "What is enforced"
                   table; settle it against
                   test/unit/tools/us-english-stem-audit.test.js.
       done when — the two statements agree and the table names every arm that
                   actually blocks.
       evidence  — run the stem-audit test with a seeded British spelling and
                   show whether it fails the build; quote the result in the PR.
       verify    — tier 0 gates, because it is prose reconciled against a test
                   whose behavior you just observed.
```
