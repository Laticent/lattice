---
origin: 2763
priority: P4
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-mosaico-layout-library.md §4.4
source: https://github.com/Laticent/lattice/pull/2763
---

# Mosaico v1 gaps: a `grid` strategy and justified rows

why now   — both are in the design note's strategy table (§4.4) and on no build-order slice. The owner has
            not yet said whether they join v1 (recommended: yes). Do not start without that answer.
where     — docs/src/lib/mosaico/ (a `grid` strategy beside `tree`, `rows` and `template`; a justified
            mode for `rows`, where every row shares one height and fills the width, as justified-layout
            does; today `align: 'justify'` only spreads a row's leftover width into its gaps)
done when — both ship with tests, README sections and entries on the demo page; the past-six-items
            heuristic for `tree` stays out until the owner asks for it
evidence  — unit tests; the demo page at 1440/820/390 via tools/screenshot.js
verify    — tier 0 gates, because both are small and additive
