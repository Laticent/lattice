---
origin: 2298
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2298#issuecomment-5769382037
backfill: true
---

# Give tools/build-gotchas-index.js a ROW_CAP.

Backfilled verbatim from the continuation brief on #2298 (merged 2026-09-22).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Give tools/build-gotchas-index.js a ROW_CAP.
       why now   — it is the last generated index with no per-row bound.
                   decisions/README.md has one (285 chars), capabilities.md has
                   one (1,500). gotchas.md is generated, 197 entries, 10,054
                   tokens, and grows one unbounded row per gotcha forever.
       where     — tools/build-gotchas-index.js; copy the shape from
                   tools/build-decisions-index.js:368 and its test at
                   test/unit/cli/decisions-index.test.js.
       done when — an over-cap row fails the build with a message naming the
                   offending entry, and the cap is a RATCHET pinned just above
                   today's widest live row, not an aspirational target.
       evidence  — the measured p50/p90/max row widths over the live corpus, in
                   the PR body, plus a seeded over-cap row shown failing.
       verify    — tier 0 gates, because a per-row cap is merge-safe by
                   construction (two concurrent PRs adding a gotcha both pass in
                   either order) and the blast radius stops at one generator.
       CAUTION   — do NOT assert any aggregate over the corpus, including "the
                   widest row is still close to the cap". build-decisions-index.js
                   explains why: it bills the PR adding entry N for N-1
                   predecessors, and it ejected #1535 from the merge queue.
```
