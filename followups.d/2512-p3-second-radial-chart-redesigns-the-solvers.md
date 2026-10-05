---
origin: 2512
priority: P3
recorded: 2026-10-05
source: engineering/decisions/2026-10-05-trama-radial-layout.md
---

# When a second radial chart arrives, design Trama's radial solvers from both charts

why now   — #2512 moved hub-spoke's solver into Trama whole. `solveStar` and `twoRings` carry hub-spoke's calibration (cone table, three-node Y, 0.5 shrink step, spacing constants), which its linter's certified envelope depends on. A cycle diagram has no center, wants a node at 12 o'clock with even angles, curved arcs between neighbors and labels inside its nodes; none of that fits them.
where     — `docs/src/lib/trama/radial.ts` (`solveStar`, `twoRings`, `ring`); `lib/core/hub-spoke-model.js` `crowding()` (the envelope a change must re-measure).
done when — the second radial chart's needs and hub-spoke's are both met by one solver design (or the second chart is shown to fit the current ones), and hub-spoke's envelope is re-measured if its bytes move.
evidence  — the second chart's demo deck; hub-spoke's seeded fuzz green; a hash diff of hub-spoke outputs, explained.
verify    — tier 2: the adversarial trio (shared library).
