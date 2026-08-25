- **A hand-edited theme's swatches no longer paint the palette you walked away
  from.** Four surfaces render a saved theme from its `essentials` — the Library
  card's swatch row, the theme picker dot in two places, the Studio drawer — plus
  the `lattice-asset/1` zip manifest. Those are the *pickers*, and once the CSS is
  the model they describe a generator that no longer produces the file. The COLORS
  are read back out of the record now. (The Library card's `N essentials` count is
  not fixed and still always reads 10: a token the record does not declare keeps the
  picker's value, deliberately, so the card cannot go blank.)
- **`overrides` and `rampStrategy` are persisted for the first time.** Both have
  been in `saveStudioTheme`'s signature and in the asset record since they were
  added, and no production caller ever passed them — so no theme in any library
  could be faithfully re-derived from its essentials, and `themeAsset`'s docblock
  promising that a saved theme reloads as itself was false.
- **Swatch values are resolved to the light arm before they are stored.** Every one
  of the ten is a `light-dark(a, b)` pair in a derived theme, and the surfaces that
  render them paint each value straight into a CSS `background` — the Library card
  filters on `/^#|^oklch|^rgb|^hsl/`, so a pair is dropped outright. Reading the
  record honestly, without resolving, blanked the card: 0 of 10 swatches survived.
- **Only a plain hex reaches the pickers.** `validateEssentials` throws on anything
  else, so an `oklch()` accent — the exact case hand-editing invites — round-tripped
  into the pickers collapsed the whole faculty to the derivation's error branch:
  blank specimen, empty token tree, Save disabled, and no message, because
  `derived.error` was computed and rendered nowhere. Non-hex values keep the
  picker's color, and the parse error is now shown.
