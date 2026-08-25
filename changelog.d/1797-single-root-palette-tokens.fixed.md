- **Fixed: the split-frame panel edge was invisible on four palettes.**
  `--panel-edge-mark` was declared at `:root:root` on ardesia / atelier /
  concrete / onyx, a specificity bump that beat the engine bundle on the old CLI
  export order. It is inert on every *packed* path — the Studio, the docs
  Playground, the Specimen and export-to-Marp all rewrite `:root` onto the slide
  `<section>`, where a repeated `:root` can never match — so those surfaces fell
  back to the engine's `var(--accent)`, which on onyx *is* the panel fill:
  measured on a real slide, a black top edge on a black panel at **1.00:1**. It
  now reads onyx's own `--spectrum-end` at 3.66:1.
- **Changed: a palette declares each token once, at plain `:root`.** #1527's
  cascade flip made the engine sheet load before the palette, so a plain `:root`
  declaration now wins the CLI export on source order *and* packs onto the slide
  everywhere else. The status trio's second copy at `:root:root` — added while
  the concat ran the other way — is removed from all eighteen self-curating
  palettes. Re-measured on the post-flip tree across all four render paths
  (real CLI export, real `--player` export in both scheme states, real marp-cli,
  and a real docs-site slide): the plain `:root` form reaches every one of them,
  while the doubled form alone paints the *engine's* trio under marp-cli.
  `checkStatusTrioParity`, which existed only to keep the two copies in sync, is
  replaced by `checkPackedRootReach` — it fails any palette custom property
  declared above plain `:root`, whether as dead weight or as the inert-only form
  that produced the panel-edge defect above.
- **Fixed: `tools/composed-contrast.js`'s regression arm could not see a status
  trio regression.** It ranks root blocks by specificity, so the trio's
  `:root:root` copy won its *base-wins* map too and both arms resolved the same
  value — the arm had been vacuous for `--pass` / `--warn` / `--fail` since that
  copy was introduced, and five `chart/status-pill-*` surfaces were added inside
  the blind spot. Removing the duplicate restored it, and it immediately
  reported eighteen real regressions (see the status-pill entry).
