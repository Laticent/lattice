---
origin: 2320
priority: P1
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2320
---

# state-chart lr clips its start dot and end ring at the frame edges

why now   — a pre-existing defect found while rendering #2320's demo deck; it
            ships in the component's own documented `lr` example, so every
            author who copies it gets clipped terminal markers
where     — lib/components/chart/state-chart/ (the lr layout: the start dot
            sits flush past the left edge, the end ring past the right). Repro:
            the `lr` fenced example in state-chart.docs.md §Variants, rendered
            with lattice-emulator.js on indaco
done when — the start and end markers draw fully inside the frame on an `lr`
            chart with 4 states, light and dark
evidence  — rasterized lr slide before/after via SendUserFile
verify    — tier 1 checker, because it is an engine layout that measures boxes
