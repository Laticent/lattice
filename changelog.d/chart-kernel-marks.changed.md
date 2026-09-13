- **Breaking: a chart component's `kernel` block now requires a `marks` array.**
  Every chart member declares its data marks and the three facts a chart finish
  is decided by — how the mark takes paint (`fill` / `bg` / `none`), what its
  body encodes (`hue` / `ramp` / `presence` / `layered` / `none`), and whether it
  carries text. **An existing chart folder without `marks` now fails to load**,
  which includes the folder-drop path: dropping `lib/components/chart/<name>/`
  with a `kernel` block is still all it takes to register a chart, but the block
  needs the new key. Contract and vocabulary:
  `lib/components/manifest.schema.json`; the reasoning is in
  `engineering/decisions/2026-09-07-chart-design-language/mark-declaration.md`.
- **Added: two checks behind the declarations.** `checkChartMarks` (via
  `npm run build:check`) fails on a declared class nothing under `lib/` writes
  and on a `data-paint` / `data-encodes` value the manifest does not know;
  `node tools/chart-language-census.js --check` re-measures `bears` off a real
  render and reports a painted mark that no manifest declares. The second is an
  on-demand command, not a CI gate.
- **Fixed: a scatter bubble and its size-key ring now stamp
  `data-encodes="layered"`, not `"hue"`.** Both are deliberately translucent so
  overlapping marks deepen where they cross; stamping the opaque dot's encoding
  would have told a finish it could hand a translucent mark a gradient. The ring
  is the bubble's own legend, so the two disagreeing was the drift this contract
  exists to stop.
