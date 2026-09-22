- **Fixed: SVG chart labels no longer paint high in Safari and on iOS.** A
  `<tspan>` carries its own `dominant-baseline`, and both SVG 1.1 and SVG 2 say
  its initial `auto` keeps the parent's baseline. WebKit resolves it to
  `alphabetic` instead, so the baseline we set on the `<text>` never reached the
  line: gantt captions rode above their bars, funnel values above their bands,
  axis ticks above their gridlines — a third of a font-size for `central`, three
  quarters for `hanging`. Measured on the chart gallery in both engines, 107 of
  256 labels sat 4–13px high on a 1280x720 slide in WebKit and 0 in Chromium,
  which is why no gate saw it: all of them render through headless Chromium. The
  value now repeats on every `<tspan>`, in the shared label kernel, in the two
  hand-rolled state-chart emitters, and in the three stylesheets that set a
  baseline in CSS. Same measurement after: 0 of 256, worst case 2.36px.
