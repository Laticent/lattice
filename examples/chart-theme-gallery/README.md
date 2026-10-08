# Chart gallery × 3 themes

The chart bucket's nine layouts (`lib/components/chart/chart.gallery.md`), rendered under
each theme's **curated chart palette**, light and dark:

| Theme | Character | Light | Dark |
|---|---|---|---|
| **cuoio** | warm brand triad (the default, #51) | [light](./chart-cuoio-light.pdf) | [dark](./chart-cuoio-dark.pdf) |
| **onyx** | slate · red · green triad | [light](./chart-onyx-light.pdf) | [dark](./chart-onyx-dark.pdf) |
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
  indaco's `themes/indaco/indaco.css` curation is intentionally kept in the separate
  PR. Once both merge, regenerating these decks reproduces them exactly.
- Rendered through the owned engine (`node lattice.js`). The marp-cli
  path these decks were first rendered through was retired in P4.
