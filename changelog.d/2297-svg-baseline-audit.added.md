- **Added: `tools/audit-svg-baselines.mjs`** — an on-demand probe that renders a
  deck through the real CLI, loads it in Chromium and WebKit, and reports how far
  each SVG label drifts between them. It needs `npx playwright install webkit`
  first: no gate in this repo renders WebKit, so this is the only instrument that
  can see a WebKit-only paint regression.
