- **Portrait charts no longer draw two unused trial drawings.** Since the chart form kernel took over portrait charts,
  the old tall-canvas check drew each portrait chart twice more and then left the output unchanged. The engine no
  longer runs it. Exported slides are byte-identical. `transformChartSection` no longer takes the internal
  `fixedCanvas` option (`engineering/decisions/2026-11-22-tall-canvas-retired.md`).
