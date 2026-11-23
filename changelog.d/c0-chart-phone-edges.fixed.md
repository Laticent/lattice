- **Fixed: chart labels no longer run off the canvas on 4:5, story and mobile slides.** A heatmap's row names,
  a row bar chart's and a row stacked bar's category names now get a column as wide as their widest word, so
  `AMER`, `Onboarding` or `Q1 FY24` no longer lose a letter at the left edge. An ep-curve's last return period
  (`1-in-250`) no longer runs past the right edge. A radar `quadrant` slide's sector name (`RISK`) no longer
  sits against an axis name or another sector name, at any size, and a name moved clear never leaves its
  canvas. Demo deck: `examples/chart-phone-edges.md`.
- Portrait charts no longer draw two unused trial drawings. Since the chart form kernel took over portrait
  charts, the old tall-canvas check drew each portrait chart twice more and then left the output unchanged. The
  engine no longer runs it, and that change alone leaves every export byte-identical.
  `transformChartSection` no longer takes the internal `fixedCanvas` option
  (`engineering/decisions/2026-11-22-tall-canvas-retired.md`).
