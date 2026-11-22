---
origin: 2035
priority: P3
recorded: 2026-11-16
area: infra
severity: low
swimlane: engineering/workflow.md §Performance
deferred: off-path — the split tier (structuralSplit over the baseline gallery); the PR that found it adds Filo rows and touches nothing the split reads
---
# `npm run bench:check` exits 1 on main: two split rows drifted from the baseline

why now   — on `main` 18bb745e, `npm run bench:check` prints `MOVED (re-bless, and say why)` for
            `split · gallery @square` (pages 356 → 359, split 64 → 65) and `split · gallery
            @mobile` (pages 362 → 355, split 66 → 64), then "Workload/dataset set drifted from
            baseline" and exits 1. Every other tier is ok. The split tier gates on work counts,
            so this is the gallery or the splitter changing since the last bless, not load. The
            check is on-demand (not a CI gate), so it has been red quietly.
where     — test/benchmark/engine-bench.mjs `splitTier`; test/benchmark/baseline.json
            `splitDatasets`; git log of the baseline gallery decks and lib/ split code since the
            rows were last blessed.
done when — the commit that moved the counts is named, and the rows are re-blessed with that
            reason in the PR (HARD RULE #19), or the move is fixed if it was not intended.
evidence  — `npm run bench:check` exit 0, and the commit named.
verify    — tier 0 gates.
