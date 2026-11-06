---
origin: 3060
priority: P1
recorded: 2026-11-06
area: infra
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: blocked — needs the owner's call on the loader's THRESHOLD (0.7) or the test's 40% floor cap; measured: THRESHOLD 0.95 regenerates to 44 ids, 0 stale, floor under 40%
source: https://github.com/Laticent/lattice/pull/3060
---

# tools/style-needs-common.json sits at both of its test's limits

why now   — on main the list carries 5 stale ids (head:base.elements, base:treatments, tail:base.variants#silent, tail:base.variants#confidential, tail:stage), the most test/unit/tools/style-needs-common.test.js tolerates (10% of 49). Any PR that edits one more listed module's CSS turns `unit` red: #3060 did, by editing base.fluid-view.css, and updated only that module's hash. Regenerating with `--write` instead adds tail:base.table-reflow and lifts the start-up floor to 41% of the sheet, past the test's 40% cap, so the obvious fix trades one red for another.
where     — tools/style-needs-common.js (`--write`, THRESHOLD), tools/style-needs-common.json, test/unit/tools/style-needs-common.test.js (the 40% floor and the 10% stale tolerance).
done when — the list is regenerated and its floor is under 40% (a higher THRESHOLD, or a deliberate new cap), and the stale count is back near 0.
evidence  — `node tools/style-needs-common.js --measure` before and after; the floor percentage from the test. Measured on #3060's head: `--write` at THRESHOLD 0.7, 0.75, 0.8, 0.85 and 0.9 all give 50 ids and a 41% floor (test fails); 0.95 gives 44 ids and passes; 0.99 gives 37 ids and passes. Fewer ids means fewer modules preloaded at Playground start, so more on-demand fetches: the trade the owner decides.
verify    — node --test test/unit/tools/style-needs-common.test.js
