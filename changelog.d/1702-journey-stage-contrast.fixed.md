- **Fixed: `journey` stage labels are legible on a light canvas.** The stage ribbon
  fills `--bg-alt` deepened toward `--surface-inverse` — a surface that tracks whatever
  canvas it is on — but its ink was pinned to the always-light `--on-dark-primary`. On
  a light deck that put 92%-white labels on a mid slate at 1.87:1 against a 3:1 floor,
  in every palette Lattice ships (31 of 64 palette x scheme pairs). The ink is now
  `--text-heading`, which follows the fill: 0 of 64 pairs below AA 4.5:1, worst 5.63:1.
  Dark mode and the print band render unchanged.
- **Added: slide contrast is now a per-PR gate.** `tools/check-slide-contrast.js` has
  measured the rendered DOM since #1207 and found every contrast defect this repo has
  shipped, but it only ran when someone asked. It now runs in the integration
  invariants tier over three rendered galleries (the component catalog on both
  canvases, plus an editorial deck). Exemptions are an explicit, individually justified
  allowlist that fails both ways — an un-exempt failure errors, and an exemption that
  stops matching errors as stale.
- **Fixed: the contrast prober no longer reports legible running headers as
  white-on-white.** It approximated paint order by DOM order, so a split layout's rail
  — a later, in-flow sibling — was discarded as the backdrop for out-of-flow chrome
  emitted before it, scoring four headers at 1.00:1 that render in white on a dark rail.
  Paint order is now ranked by CSS painting layer first, DOM order within a layer. Runs
  sitting over a raster or gradient backdrop are flagged rather than silently scored
  against the paint behind the picture.
