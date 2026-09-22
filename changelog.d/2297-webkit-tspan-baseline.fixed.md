- **Fixed: SVG chart labels no longer paint high in Safari and on iOS.** A
  `<tspan>` carries its own `dominant-baseline`, and WebKit resolves its initial
  `auto` to `alphabetic` rather than to the parent's computed value, so the
  baseline we set on the `<text>` never reached the line: gantt captions rode
  above their bars, funnel values above their bands, axis ticks above their
  gridlines. Measured on the chart gallery in both engines, 107 of 256 labels sat
  4–13px high on a 1280x720 slide in WebKit and 0 in Chromium — which is why no
  gate saw it, since all of them render through headless Chromium. The value now
  repeats on every `<tspan>`, in the shared label kernel, in the two hand-rolled
  state-chart emitters, and in the three stylesheets that set a baseline in CSS.
  Same measurement after the fix: 0 of 256 over 4px, worst case 2.36px.
- **Added: `tools/audit-svg-baselines.mjs`**, an on-demand probe that renders a
  deck through the real CLI, loads it in Chromium and WebKit, and reports the
  per-class drift between them. It needs `npx playwright install webkit` first —
  no gate in this repo renders WebKit.
