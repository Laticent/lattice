---
origin: 3060
priority: P1
recorded: 2026-11-06
area: infra
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — the list was at both limits on main before this PR; regenerating it is a choice about the Playground loader's floor, not part of the fluid-view change
source: https://github.com/Laticent/lattice/pull/3060
---

# tools/style-needs-common.json sits at both of its test's limits

why now   — on main the list carries 5 stale ids (head:base.elements, base:treatments, tail:base.variants#silent, tail:base.variants#confidential, tail:stage), the most test/unit/tools/style-needs-common.test.js tolerates (10% of 49). Any PR that edits one more listed module's CSS turns `unit` red: #3060 did, by editing base.fluid-view.css, and updated only that module's hash. Regenerating with `--write` instead adds tail:base.table-reflow and lifts the start-up floor to 41% of the sheet, past the test's 40% cap, so the obvious fix trades one red for another.
where     — tools/style-needs-common.js (`--write`, THRESHOLD), tools/style-needs-common.json, test/unit/tools/style-needs-common.test.js (the 40% floor and the 10% stale tolerance).
done when — the list is regenerated and its floor is under 40% (a higher THRESHOLD, or a deliberate new cap), and the stale count is back near 0.
evidence  — `node tools/style-needs-common.js --measure` before and after; the floor percentage from the test.
verify    — node --test test/unit/tools/style-needs-common.test.js
