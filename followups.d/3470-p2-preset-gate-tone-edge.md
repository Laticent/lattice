---
origin: 3470
priority: P2
recorded: 2026-11-27
area: theming
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §9
deferred: blocked — wave 1 parked until after 1.0 (D15)
source: https://github.com/Laticent/lattice/pull/3470
---

# preset-gate holds `marks: tone` to its fill, but the owner's marks D1 accepts fill or ink edge

why now   — the owner ruled (marks D1, 2026-11-23, recorded in #3470's body) that under `marks: tone` a mark passes the 3:1 floor on its fill OR its ink edge. `tools/preset-gate.js` on `main` checks the fill only (its header, "WHY THE FILL"), so Wave 1's tone presets (Earnings, Museum) would fail it there: Museum's palest wedge fills at 1.41:1, and its edge measures 5.19:1.
where     — `tools/preset-gate.js`, the mark-fill pass (`MARK_FLOOR`, `declaredMarks`). #3470's commit `33f3a72` already holds the change and its test, `test/unit/tools/preset-gate-contrast.test.js`.
done when — under `marks: tone` the gate passes a mark whose fill or ink edge clears 3:1, every other finish is still held to its fill, and the gate's header comment says so.
evidence  — the #3470 numbers above, re-measured on the rebased branch.
verify    — `node tools/preset-gate.js` on Museum and Earnings; the failing arm in `preset-gate-contrast.test.js` turns red when the edge rule is dropped.
