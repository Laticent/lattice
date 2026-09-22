---
origin: 2247
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2247#issuecomment-5761690751
backfill: true
---

# Move `relationship.test.js:1211` out of the blocking unit suite

Backfilled verbatim from the continuation brief on #2247 (merged 2026-09-21).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P3 · [no ticket] Move `relationship.test.js:1211` out of the blocking unit suite
       why now   — it asserts a WALL-CLOCK ratio ("4x the input cost 12.9x the time") inside
                   `npm test`, so it fails under CPU contention. It produced a phantom red
                   for two independent reviewers during #2247. HARD RULE #19 keeps wall-clock
                   out of blocking CI for exactly this reason.
       where     — test/unit/core/relationship.test.js:1211.
       done when — the complexity claim is still asserted (operation counts, not seconds),
                   or the timing arm moves to the on-demand bench tier.
       evidence  — the same file green while a Chromium render saturates the CPU.
       verify    — tier 0 gates. Touching a CI job/step would need the owner first; moving an
                   assertion inside an existing suite does not.
```
