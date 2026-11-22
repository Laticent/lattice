---
origin: 3247
priority: P3
recorded: 2026-11-16
area: chart
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: large — the sketch face is ~19px wider a label than the default face, and the type is already at the scale's floor (HARD RULE #4); the stylesheet's own note on the auto arm says closing it needs a type step below --fs-meta or a layout that is not a table
source: https://github.com/Laticent/lattice/pull/3247
---

# matrix-grid: the five-column stress slide still clips in `mode: sketch` on a tall or phone box

why now   — #3247's checker rendered the stress slide with `mode: sketch` at story. The fix gave the gutter back, which cut the overrun from 120px (main) to 60px, but the hand face's wider labels still run the fifth column past the box, and the export warns CONTENT CLIPPED at story and at mobile.
where     — lib/plugins/chart-family/kinds/matrix-grid/matrix-grid.styles.css (the tall/strip arm; the `table-layout: auto` arm's note on what closing it costs).
done when — matrix-grid.gallery.md's stress slide (6 × 5) exports with no CONTENT CLIPPED at story and mobile in `mode: sketch`, every column label and pill in full.
evidence  — `node dist/lattice.js <the stress slide, size: story, mode: sketch> -o out.pdf` prints `⚠ CONTENT CLIPPED … page 2`; the same at `size: mobile`.
verify    — export the stress slide at story and mobile with `mode: sketch`, and read the CLI's clip report.
