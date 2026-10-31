---
origin: 2962
priority: P7
recorded: 2026-10-29
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-30-chart-reflow-narrow-boxes.md
deferred: blocked — the design note is written; the time axis is picked (vertical, split rather than shrink, 2026-10-30), and the grid forms are picked (roadmap as one phase card a page; matrix-grid split one column a page, 2026-10-30); building them waits on #2988's text-room thresholds landing on main
---

# Charts and diagrams need their own reflow for narrow boxes

why now   — the owner wants as many components as possible responsive. After text-room reflow (fit-everywhere §13) the chart and diagram galleries clip 272 slide-cells at the nightly's six cells; 129 of them are TEXT slides in those galleries (the shared "See also" closing slide alone is 79), and the rest fall into five families with different forms: list-shaped charts (59), grids (44), time axes (15), Mermaid diagrams (24) and plotted charts, which clip almost nothing but shrink their labels below reading size, a failure the fit probe does not yet measure. engineering/decisions/2026-10-30-chart-reflow-narrow-boxes.md gives options per family with mockups and a recommended order.
where     — the chart and diagram components under lib/components/chart/ and lib/components/diagram/, the shared chart frame (lib/plugins/chart-family), tools/lib/fit-harness/page.js for the legibility measure, and engineering/chart-styling.md.
done when — the picked forms are built (§2C and §2E of the note: roadmap cards, matrix-grid one column a page, a vertical gantt that splits rather than shrinks, every label at body size), the shared steps land first (the closing list and the chart subtitle at tight room, and a figure-legibility count in the fit probe), and the chart galleries' clip counts at portrait@hall and story@hall fall in the fit ratchet.
evidence  — the ratchet diff in test/fit/baseline.json and renders of one slide per family at story@hall before and after.
verify    — npm run fit:harness -- --only chart --sizes square,portrait,story --venues laptop,hall --packs none --edits none --ratchet test/fit/baseline.json
