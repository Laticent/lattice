---
origin: 3334
priority: P1
recorded: 2026-11-20
area: infra
severity: medium
swimlane: engineering/quality-assessment.md
deferred: off-path — #3334 adds a knip-only check that never runs this path; the crash is in the full assessment
source: https://github.com/Laticent/lattice/pull/3334
---

# npm run quality:check runs out of memory at Node's default heap

why now   — the full assessment (`npm run quality`, `quality:check`, `quality:bless`) aborts with "JavaScript heap out of memory" after about 40 s near 2 GB on 2026-11-20; with --max-old-space-size=8192 it completes. Nothing runs it, so nobody saw.
where     — tools/quality-assessment.js and whichever step holds the memory (dependency-cruiser over 1,374 modules, jscpd over 1,135 files, or the in-process complexity walk); measure each alone first.
done when — `npm run quality:check` completes at the default heap, or its npm scripts set the heap with the measured peak and a comment saying why.
evidence  — each step's peak RSS before and after.
verify    — tier 0, because it is a measurement.
