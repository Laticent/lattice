- **Fixed: every palette's curated status trio now actually paints in an
  exported deck.** `--pass` / `--warn` / `--fail` were declared at plain `:root`
  in all eighteen self-curating palettes, and the CLI export path concatenates
  `lib/base/base.tokens.css` *after* the palette — so at equal specificity the
  engine default won on source order and an exported PDF painted base's
  `#2D6A3F` / `#B45309` / `#991B1B` on all thirty-two palettes. Every value
  #1801 had just re-solved for the achromatopsia floor was inert there too. The
  trios are now declared at BOTH `:root` and `:root:root`, because neither form
  alone reaches every render path: `:root` packs onto the slide `<section>` and
  wins the engine (Studio, docs Playground) and export-to-Marp paths, while
  `:root:root` survives that rewrite literally — inert there — and wins the
  unpacked CLI export on specificity. Confirmed on all three, including under
  real marp-cli. `checkStatusTrioParity` fails the build if the two blocks drift.
- **Fixed: three inks that only fail on a surface no token table can see.**
  `--code-inline-fg`'s dark arm on brina / burgundy / crepuscolo / cuoio /
  laguna / mustard (the inline-code chip inside a `kanban` card, whose fill lifts
  `--bg-alt` 12% toward white), `concrete`'s dark body text on that same card,
  and `--text-secondary` on brina / laguna (the `policy-recommendation` `defer`
  badge, ink on its own 12% tint). `tools/composed-contrast.js` gains the three
  surfaces that model them and drops from 70 sub-threshold pairs to 66.
- **Fixed: `tools/check-slide-contrast.js` no longer invents a backdrop under a
  line-wrapped inline.** The underlay scan tested containment against
  `getBoundingClientRect()`, which on a wrapped inline is the *union* of its line
  fragments — area the element never paints. Four `redline` runs per slide, on
  nineteen palettes, were scored against a doubled `--pass-bg` band that exists
  nowhere on the page (4.27:1 reported where the rasterized pixel reads 5.02:1).
  It now tests each rect from `getClientRects()`.
- **Fixed: `tools/composed-contrast.js`'s export arm ignored `:root:root`.** It
  merged the palette and the bundle by source order alone, so the four palettes
  that had already escaped the concat order for `--panel-edge-mark` were scored
  on the bundle's value. Root-family blocks are now ranked by specificity, with
  `:where()` contributing zero as the spec requires.
- **Fixed: a `--player` export could paint two different greens depending on the
  viewer's scheme toggle.** `lib/export/player-core.mjs` collapses `light-dark()`
  into a light base plus a flat dark block, and both of its collectors took the
  LAST declaration of a token as the cascade winner — true only at equal
  specificity. Measured on a real export: the light base kept the palette's value
  while the dark block ended with the engine default. Both collectors now rank by
  root specificity, with source order as the tie-break, so nothing changes where
  specificity is equal.
- **Changed: the 32-palette rendered sweep now sweeps two decks, not one.**
  `examples/gallery-jargon.md` joins `test/integration/baseline-decks/gallery.md`
  in `test/integration/invariants/palette-sweep.test.js`; the ceiling table, the
  drop-set pins and the provenance-sheet count are per-deck. It found a run on
  its first pass that no gate could see, because `gallery.md` does not write the
  markup that reaches it: a `kanban` card with a STATUS sub-bullet takes a
  status-tinted fill, and the card title's `--text-heading` lands on that wash
  rather than the neutral card. Recorded as a ceiling and tracked, not fixed
  here. Both decks together run in ~2 min 40 s, so the gate stays on the per-PR
  path.
