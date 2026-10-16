---
origin: 2399
priority: P3
recorded: 2026-09-27
area: infra
severity: low
swimlane: engineering/workflow.md §Performance
---

# The bench's math rows count 16 slides; the gallery has 17

why now   — `npm run bench:check` fails on a clean tree: `math` and `edit · math` report
            WORKLOAD CHANGED (16 → 17 slides). #2399 added a slide to
            lib/components/math/math/math.gallery.md after the last bless (#2398), so both
            rows have been recording nothing since. Found while blessing the flowchart rows
            for the Trama font-wait change, which re-blessed only its own rows.
where     — test/benchmark/baseline.json (`datasets.math`, `editDatasets["edit · math"]`).
done when — `npm run bench:check` reports no WORKLOAD drift, from a bless on a quiet
            machine whose timing rows are not looser than the ones they replace.
evidence  — the bench:check output before and after, and the baseline diff.
verify    — tier 0 gates.
