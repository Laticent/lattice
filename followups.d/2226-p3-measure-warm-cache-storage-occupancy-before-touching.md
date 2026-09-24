---
origin: 2226
priority: P3
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2226#issuecomment-5673609887
---

# Measure warm Cache Storage occupancy before touching the SW cap

Backfilled verbatim from the continuation brief on #2226 (merged 2026-09-15).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P3 · [no ticket] Measure warm Cache Storage occupancy before touching the SW cap
       why now   — #2226 corrected sw.js's stale "~213 versioned files ≈ 500" to 437 /
                   ~717 of an 800 cap, but 437 counts files at the ORIGIN. The cap
                   bounds what a reader CACHED, and most of the 437 (157 hljs grammars,
                   70 plans, 31 samples) no session ever fetches. Blocks P1's Option A,
                   which would double the versioned half.
       where     — docs/public/sw.js (CAP + the headroom argument, both flagged in place).
       done when — a real warm-cache entry count exists, so the cap can be sized from a
                   measurement instead of an upper bound.
       evidence  — entry count from real Cache Storage on the deployed site.
       verify    — tier 0 once measured; the risk is in the number, not the code.
```
