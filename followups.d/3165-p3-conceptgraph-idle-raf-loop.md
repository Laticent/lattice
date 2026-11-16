---
origin: 3165
priority: P3
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §1
deferred: off-path — found during the device-tier audit; ConceptGraph is not a surface this PR touches
source: https://github.com/Laticent/lattice/pull/3165
---

# ConceptGraph runs its animation loop every frame, even when nothing moves

why now   — The device-tier audit found that `tick` in `docs/src/components/model/ConceptGraph.astro`
            (about lines 111, 164 and 196) always calls `requestAnimationFrame` again. Under reduced
            motion, or once the orbit stops, the page still spends a frame callback 60 times a second.
            That costs the most on exactly the weak machines the LITE tier exists for.
where     — docs/src/components/model/ConceptGraph.astro
done when — the loop stops when there is no orbit, drag or easing in flight, and restarts on input.
evidence  — read from the source by the audit scout; not profiled.
verify    — Performance panel on the concept page with reduced motion on: no rAF callbacks while idle.
