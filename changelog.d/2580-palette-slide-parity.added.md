- **Added: `tools/palette-slide-parity.js`, the harness that measures whether an importable
  stylesheet draws a slide the way the CLI does.** It diffs every slide against the CLI's HTML
  render under three arms: `render()`'s own stylesheet, an unpublished packed palette candidate,
  and the published engine-plus-palette pair. `--bundled` adds a fourth arm for a stylesheet a
  bundler built, such as a Vite build of the candidate. It is on-demand and backs the open decision in
  `followups.d/2580-p3-packed-palette-form.md`.
