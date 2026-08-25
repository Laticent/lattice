- **The kpi status pill is now pinned on the Playground, not only in an exported PDF.**
  `docs/e2e/playground-kpi-pill.spec.ts` seeds a deck into the real Playground and reads
  computed styles from the preview frame, asserting the pill's ground is **opaque** (an alpha
  value means the palette's `--*-bg` tint is back and the pill is inheriting its tile again),
  that the state hue inks both label and border, and that the pair clears AA. Verified to
  catch the regression it describes: reverting the ground to `--{pass,warn}-bg` turns all
  three cases red.
