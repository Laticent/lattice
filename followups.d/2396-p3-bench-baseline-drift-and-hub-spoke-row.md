---
origin: 2396
priority: P3
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2396
---

# `test/benchmark/baseline.json` trails `main` by about 40%, and hub-spoke has no bench row

why now   — while building hub-spoke (#2396), `npm run bench` on `main` at 03730a1 read about 40% slower than the committed baseline (normal 79.4 ms against 60.2, stress 292.2 against 174.2, same machine class). `bench:bless` can only re-bless every row, so #2396 did not bless, to avoid silently absorbing the drift.
where     — `test/benchmark/baseline.json`, `test/benchmark/engine-bench.mjs`; bisect from `6110a1e` (the last bless) to `main`.
done when — the drift is explained (a code regression gets fixed, or machine noise gets re-blessed with that justification), and a `hub-spoke (gallery + tiered x3)` dataset is added and blessed (it was drafted in #2396's fix round, and the scratch version excluded it from the browser tiers).
evidence  — `npm run bench` before/after on the same machine; the baseline.json diff.
verify    — `npm run bench:check` within band.
