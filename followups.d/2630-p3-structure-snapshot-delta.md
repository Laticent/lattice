---
origin: 2630
priority: P3
recorded: 2026-10-11
area: infra
severity: low
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §7
source: inversion lens on #2630
---

# Make the structure snapshot read itself: print the delta, test the part set

why now   — test/quality/structure.json is refreshed by hand, and nothing compares it to the live
            tree, which is the shape in which the quality baseline went stale. The inversion lens
            asked for two cheap guards.
where     — tools/structure.js, tools/check-structure.js, test/unit/tools/structure.test.js.
done when — build:check prints, without failing, the change in a few headline numbers (core lines,
            the largest part, core's islands, the kit's export count), and a test fails when the
            snapshot's set of parts differs from the live set.
