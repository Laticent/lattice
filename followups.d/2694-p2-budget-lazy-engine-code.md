---
origin: 2694
priority: P2
recorded: 2026-10-14
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-14-engine-spine.md §7
source: https://github.com/Laticent/lattice/pull/2694
---

# Budget the code that loads with import(): chart kernels and the lint core

why now   — engineJsGz and eagerJsGz deliberately do not follow import(), so a chart kernel
            growing (map is 77.7KB gz beyond the engine) or the lint core growing is invisible
            to every gate. That is how the runtime went from 163KB to 383KB unwatched.
where     — docs/scripts/check-route-budget.mjs, docs/route-budget.json; esm/chunks.json lists
            each chart entry's static chunks.
done when — the ledger carries a cap on the largest chart closure beyond the engine and on the
            lint core's closure, with soft/ceiling like every other metric. Adding a metric is
            the owner's call (a number the owner sets).
evidence  — measured 2026-10-14: chart closures beyond the engine run 0.8KB (timeline-list) to
            77.7KB (map); hub-spoke 39.8KB.
verify    — growing one chart kernel by 3KB fails the docs build.
