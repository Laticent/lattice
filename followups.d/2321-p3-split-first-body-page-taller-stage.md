---
origin: 2321
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2321
---

# The first body page of a split run gets a taller stage than the rest

why now   — a lone row centers in its stage, so a taller stage on the first body page seats it lower: at `size: square` the inventory ledger and editorial rows sit ~30px lower on page 1 of the run than on pages 2–4 (stage 740px vs 683px). #2321 made every other page of a run hold one height; this is the one page still out of line. Identical on main.
where     — the split envelope's first body page versus its `(cont.)` pages; likely the masthead (heading without the `(cont.)` suffix, or a different eyebrow/rule block) claiming a different height. Shared split chrome, not inventory CSS.
done when — every body page of a split run has the same `.cell-stage` height at square, portrait and mobile, so a lone row sits at one height across the whole run.
evidence  — `sed 's/^size: portrait/size: square/' examples/inventory-split-portrait.md > /tmp/sq.md && node lattice-emulator.js /tmp/sq.md /tmp/sq.html`, then measure `.cell-stage` height per `section.lat-split-native`.
verify    — the same measurement across the split demo decks (auto-split, split-structure, split-envelope) — a shared-chrome fix moves every atomized component.
