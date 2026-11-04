---
origin: 3021
priority: P6
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — three new layouts plus engine markup (the repeated-label blocks need the engine to render a second form)
source: https://github.com/Laticent/lattice/pull/3021
---

# Narrow layouts for the other table kinds: labels plus a run of columns, two-line rows, one block per column

why now   — #3021 lays out records and key-value tables (73% of the bake-off corpus). Measure-over-time, option-comparison and cross-tab tables keep their grid; ranked lists and schedules keep their table; independent lists fall back to cards. The prototype for all nine is in tools/frame-lab/proto/.
where     — lib/core/table-shape.js REFLOW map; the engine markup for repeated labels; lib/base/base.table-reflow.css.
done when — each kind gets its prototyped layout, the bake-off floor test still passes, the fit check holds every new layout, and no existing deck changes.
evidence  — the Frame Lab table-types entry with the prototype off.
verify    — npm run tables:bakeoff; npm run lab:build; a render sweep against main.
