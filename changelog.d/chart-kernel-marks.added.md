- **Added: every chart member declares its data marks in its manifest.** A new
  `kernel.marks` block names each mark a chart paints and the three facts a
  chart finish is decided by — how the mark takes paint (`fill` / `bg` / `none`),
  what its body encodes (`hue` / `ramp` / `presence` / `layered` / `none`), and
  whether it carries text. Those facts previously lived in a hand-written table
  outside the engine, and that table was wrong every time anyone measured it:
  it called `funnel-band` text-bearing when none of the five bands carries a
  label, which is why funnel rendered identically under all three finishes.
  Two gates hold the declarations up — `checkChartMarks` (via `build:check`)
  fails on a class nothing emits and on a stamped attribute the manifest does
  not know, and `node tools/chart-language-census.js --check` re-measures
  `bears` off a real render.
- **Fixed: a scatter bubble now stamps `data-encodes="layered"`, not `"hue"`.**
  A bubble is deliberately translucent so overlapping bubbles deepen where they
  cross; it stamped the same encoding as an opaque dot, which would have told a
  finish it could hand a translucent mark a gradient.
