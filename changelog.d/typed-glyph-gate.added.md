- **Chrome is drawn, not typed — ten new `--shape-*` mask tokens.** Every arrow,
  chevron, spark, transport control and status mark the engine draws now comes from an
  SVG mask whose color is the element's, so it renders identically whatever fonts a
  machine has. Eighteen `content:` glyph occurrences across ten stylesheets were typed
  glyphs (`✓` `→` `❯` `✦` `●`); a typed glyph has no shape of its own — the deck's type
  family carries none of them, so each machine substitutes a different font, a color
  emoji, or a hollow box. Governed by HARD RULE #29. (They are `--shape-*`, not
  `--icon-*`: the docs site already owns 32 Lucide `--icon-*` on `:root`, and five of
  the names would have collided with different geometry.)
- **`lint:deck` now coaches typed glyphs instead of silently rendering them.** A `✓` in
  a deck gets a WARNING — never an error — naming what it will look like on another
  machine, the modifier that does it properly, and the concrete fix. Authors keep
  writing whatever they like; the linter offers the better option.
- **New `state-cells` modifier.** Puts the universal status markers (`[x]` `[-]` `[ ]`
  `[/]`) to work in ANY table's cells — previously only `obligation-matrix` decoded all
  four, and `matrix-grid` decodes a different, positional set of three. So a comparison
  table can now carry the color-blind-safe status disc rather than a typed check.
- **The a11y and print status glyphs are deliberately unchanged.** They are the
  grayscale-safe shape channel for color-blind and toner-only readers, and the
  measurements behind them (empty-alt `content` is the only thing that keeps them out
  of the accessibility tree; the doubled declaration is a cross-engine pair) are
  recorded in `engineering/decisions/2026-08-25-typed-glyphs.md`.
- **New demo deck `examples/drawn-not-typed.md`** — what a typed glyph actually does
  on a machine that is not yours, both new modifiers in use, and the three places the
  rule deliberately stops.
