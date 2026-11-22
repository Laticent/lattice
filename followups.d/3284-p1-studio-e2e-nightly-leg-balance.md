---
origin: 3284
priority: P1
recorded: 2026-11-22
area: infra
severity: low
swimlane: engineering/development.md §Studio e2e suite (Playwright) — and running it in the sandbox
deferred: off-path — logged from a session archive sweep; the shard weights are not touched by the PR that records it, and a re-bless wants several scheduled runs, not one
source: https://github.com/Laticent/lattice/pull/3284
---

# The Studio E2E nightly's legs run just over the balance #3284 promised

why now   — #3284 dealt the eight legs by measured time and promised each leg ≤ 40 min with slowest ÷ mean ≤
            about 1.2. The 2026-11-21 nightly (run 44906536247, posted on #2035) measured 39.4, 27.9, 29.5,
            40.6, 41.0, 29.2, 29.6 and 30.4 min: mean 33.5, slowest 41.0, ratio 1.23. Both are just over the
            target, and three legs sit near 40 while five sit near 30, so the weights are off for a few specs,
            not uniformly. The step's hard cap is 45 min, so the headroom is 4 min on the slowest leg.
where     — docs/e2e/shard-weights.json, docs/e2e/shard-plan.mjs, `node docs/scripts/e2e-shard-bless.mjs`;
            .github/workflows/studio-e2e-nightly.yml (the 45-minute step, the ~1.5x re-bless note).
done when — three consecutive scheduled nightlies have every leg ≤ 40 min and slowest ÷ mean ≤ 1.2, or the owner
            moves the target.
evidence  — run 44906536247's per-leg times above.
verify    — the per-leg durations of the next three scheduled `Studio E2E nightly` runs.
