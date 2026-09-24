---
origin: 2338
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2338
---

# state-chart on a portrait deck clips a six-state machine with long labels

why now   — the engine's own "Content clipped" badge fires: node 5 is cut and
            node 6 plus the end ring are gone. An `lr` chart is forced to `tb`
            on portrait (`state-chart.transform.js:675`), and the column is
            taller than the stage. Measured: the end ring overhangs
            `.chart-body` by 274px on `size: portrait`, 38.2px on `size: story`.
            Pre-existing: identical numbers with and without the `lr` padding
            fix, whose selector never matches a `tb` figure.
where     — lib/components/chart/state-chart/ — the tb column's fit on a tall,
            narrow stage (labels wrap to three lines at portrait node width, so
            each node is ~3x its landscape height). Repro: `size: portrait`,
            `<!-- _class: state-chart lr -->`, six states — "Draft awaiting
            review `start`", "Submitted to the queue", "Triaged by on-call",
            "Assigned to engineer", "Fixed pending verify" (with `reopen => 4`),
            "Closed and archived `end`" — chained `=> N+1`
done when — all six nodes and both markers draw inside the frame on portrait
            and story, with no clipped badge
evidence  — rasterized portrait + story slide before/after via SendUserFile
verify    — tier 1 checker, because it is an engine layout that measures boxes
