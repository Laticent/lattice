- Charts no longer export black in a Studio PDF or PPTX. The rasterizer bakes each
  chart's paint inline but deliberately leaves a scheme-varying color as
  `var(--token)` so a re-themable host can move it — and `html-to-image` serializes
  the chart into a document that has no deck stylesheet and never walks an `<svg>`'s
  descendants, so the token resolved to nothing and `fill` fell to its SVG initial,
  black. Measured on a flattened heatmap: 47 of 62 paints. The flattened chart now
  defines, on its own root, every token its paints still name.
