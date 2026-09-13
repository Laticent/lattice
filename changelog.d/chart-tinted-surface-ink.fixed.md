- **Two chart labels that print on a tinted mark now use the body ink.**
  `state-chart`'s step ordinal and `kanban`'s size token were both set in
  `--text-muted`, which is calibrated against the slide — but neither sits on the
  slide. Measured on the rendered gallery they were **4.02:1** (light) /
  **4.48:1** (dark) and **4.69:1** / **3.38:1** against the surfaces they actually
  sit on. Three of those four are under the 4.5:1 floor; kanban's light arm was
  already passing, and the change makes it consistent rather than compliant.
- **`radar`'s scale rungs were painted UNDER the series polygons.** SVG has no
  `z-index` — later in the document is on top — and the 2.5 / 5 / 7.5 labels were
  emitted with the grid, so every polygon reaching that far dimmed the number the
  polygon is read against. They failed AA on **all twelve themes**, 2.60–4.36:1.
  They now paint last, and carry the family's canvas-coloured halo
  (`paint-order: stroke`, the idiom stacked-bar's total and waterfall's value
  already use) so a rung sits on `--bg` whatever runs behind it.
- **`concrete` flattens the chart fill wash.** `chart-family.css` states the
  contract the wash exists to keep — "the wash only tints, so `--text-heading`
  labels clear it on both canvases" — and concrete is the one theme where that was
  false, because its canvas is an unusually dark greige (`#B8B8B5`) and the same
  mix lands far closer to the heading ink than it does on a near-white page. It is
  not fixable from the ink side: concrete's `--text-heading` already resolves to
  `15,15,14` and pure black reaches only 4.20:1 on the old bottom stop. The wash
  is read through `var(--palette-fill-*, <engine default>)` so a palette can move
  it; every other theme is untouched.
- **Verified across 12 themes × 2 media — `screen` and `print` — on both sides of
  the change, with the same instrument: 196 text AA failures → 2, and the mark
  floor no worse (346 → 338, no mark class worse, two better).** The two that
  remain are the same defect in both media: a `state-chart` connector crosses one
  corner of a node label on `concrete` light, putting **0.1% of that label's
  pixels** at 4.25:1. That is a layout defect in the dagre edge layer, it
  pre-dates this branch (it measured 3.41:1 there), and it is not a colour choice.
- The instrument changed too, and the old numbers should not be trusted. The
  solver now SAMPLES the backdrop out of the render — two screenshots of the same
  slide, one with the glyph fill removed, and the pixels that differ are the
  pixels a glyph covers — instead of compositing a backdrop from computed style.
  The modeling version scored text over a gradient against the **more flattering**
  end of the ramp and discarded the ink's own alpha, and both defects hid real
  failures: it reported 0 where this reports 2, and 0 on `main` where this reports
  196. Each row now carries a `share`, the fraction of the glyph's pixels at the
  reported ratio, which is what tells a colour choice from a crossing connector.
