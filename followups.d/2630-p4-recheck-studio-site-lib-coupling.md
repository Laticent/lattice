---
origin: 2630
priority: P4
recorded: 2026-10-11
area: website
severity: low
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §2
source: inversion lens on #2630
---

# Re-measure Studio and site/lib change coupling after the untangle

why now   — before #2630, the Studio and docs/src/lib changed together in 91% of the commits that
            touched either. The untangle moved pure modules into docs/src/lib, which now shows lib/core's
            pattern early: 57 islands across 95 files. Whether it is becoming a second dumping
            ground needs about three months of history.
where     — docs/src/lib/, docs/src/components/studio/; `npm run structure`; tools/change-coupling.js.
done when — after 2027-01-11, the co-change rate and site/lib's island count are measured again
            and compared with the figures in engineering/decisions/2026-10-11-codebase-structure.md §2 and §8.
