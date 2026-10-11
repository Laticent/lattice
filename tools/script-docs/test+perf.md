---
group: Test & verify
---
node:test SCALING guards in test/benchmark/ — they assert a complexity RATIO (4x the input costs ~4x the time, not ~16x), never a wall clock, so they mean the same thing on any machine. On-demand, not in `npm test` and not a blocking CI gate: a wall-clock arm in a suite node --test runs in parallel is a flake generator. Reach for it after touching a scanner or a hot-path regex.
