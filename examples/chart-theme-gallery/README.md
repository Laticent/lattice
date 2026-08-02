# Chart gallery × 3 themes

The chart bucket's nine layouts rendered across the three themes that now
carry a **curated chart palette** — so you can read each theme's
`--chart-cat*` / `--chart-state-*` curation side by side, light and dark.

Each deck is the same source (`lib/components/chart/chart.gallery.md`),
re-rendered under one palette:

| Theme | Character | Light | Dark |
|---|---|---|---|
| **cuoio** | warm brand-triad (the shipped default, #51 curation) | [light](./chart-cuoio-light.pdf) | [dark](./chart-cuoio-dark.pdf) |
| **onyx** | slate · red · green triad (Jun-4 re-curation) | [light](./chart-onyx-light.pdf) | [dark](./chart-onyx-dark.pdf) |
| **indaco** | cool blue palette | [light](./chart-indaco-light.pdf) | [dark](./chart-indaco-dark.pdf) |

Every deck covers all nine chart layouts: **gantt · kanban · progress ·
state-chart · pie · quadrant · radar · timeline · word-cloud**.

## Notes

- These are reviewer deliverables, not regression baselines — they are not
  page-count-asserted and are excluded from the npm tarball by the existing
  `!**/*.pdf` rule.
- The **indaco** decks preview the curation that lands in its companion PR
  (`chart(indaco): re-curate chart palette under the unified token system`).
  This branch carries onyx's curation and the canvas-aware fill engine work;
  indaco's `themes/indaco.css` curation is intentionally kept in the separate
  PR. Once both merge, regenerating these decks reproduces them exactly.
- Rendered through the owned engine (`node lattice-emulator.js`). The marp-cli
  path these decks were first rendered through was retired in P4.
