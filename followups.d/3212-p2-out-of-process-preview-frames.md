---
origin: 3212
priority: P2
recorded: 2026-11-15
area: website
severity: low
swimlane: engineering/decisions/2026-11-15-studio-map-load-cost.md §5
deferred: large — an architecture change (a second origin, capture over postMessage, HARD RULE #22 review); needs the owner's call before building
source: https://github.com/Laticent/lattice/pull/3212
---

# Prototype an out-of-process preview frame and measure it

```text
  P2 · [no ticket] measure a preview frame on its own origin (its own renderer process)
       why now   — Every preview frame is a same-origin srcdoc iframe, so its engine parse
                   (~300 ms at 4x CPU) and its style/layout run on the Studio's main
                   thread. A frame on another origin gets its own process in desktop
                   Chrome and runs in parallel. Raised by the owner on #3212 ("can this be
                   made faster and more parallel via worker pool?"); a worker cannot (no
                   DOM), a cross-origin frame can.
       where     — the stage frame only, first: docs/src/components/studio (the live
                   preview), and every direct `frame.contentDocument` read it relies on
                   (pool-capture.ts slotShows/captureSlot, preview-pool.tsx).
       done when — a measured prototype of the STAGE frame on a second origin, with the
                   cost written down: TBT/INP gain on desktop Chrome, memory per process,
                   behavior on Safari and low-memory Android (no process isolation there),
                   and what HARD RULE #22's sinks need. Then the owner decides.
       evidence  — npm run perf:load and the typing probe (alternated, 4x CPU) on the
                   prototype vs main; renderer memory per stage (activity-bench.mjs).
       verify    — tier 2 (the adversarial trio) if it goes past a prototype: a new origin
                   and a security model change.
```
