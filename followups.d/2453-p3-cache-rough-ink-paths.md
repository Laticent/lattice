---
origin: 2453
priority: P3
recorded: 2026-09-28
area: engine
severity: low
swimlane: engineering/decisions/2026-09-28-inline-sparks.md
source: https://github.com/Laticent/lattice/pull/2453
---

# Cache generated rough-ink paths per plan in the live preview

why now   — PR #2453 enrolled inline sparks in the sketch ink. In a live preview (Studio,
            Playground) any layout change on a sketch deck regenerates EVERY rough.js path on
            the page, even for sparks that did not move. Measured on a 6-slide, 90-spark
            sketch deck: 19 ms of generation per change for the sparks (1.2 ms for the
            tables).
where     — lib/runtime/index.js `startRoughInk` → `draw()`: it calls `pathsForPlan` for every
            plan whenever `roughInkFingerprint` changes. lib/core/rough-ink.js `pathsForPlan`.
done when — the runtime memoizes `pathsForPlan` output by each plan's own fingerprint, so a
            change regenerates only the plans that moved; the output stays byte-identical.
evidence  — the .scratch/perf/ink.mjs measurement in the #2453 session: measure 3.2 ms,
            generate 18.6 ms (sparks only), 420 paths.
verify    — HARD RULE #19: a bench scenario for a sketch deck with many sparks in
            test/benchmark/engine-bench.mjs, before/after numbers, `npm run bench:bless`.
