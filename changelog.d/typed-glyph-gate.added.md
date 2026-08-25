- **Chrome is drawn, not typed — fourteen new `--icon-*` mask tokens.** Every arrow,
  chevron, spark, transport control and status mark the engine draws now comes from an
  SVG mask whose color is the element's, so it renders identically whatever fonts a
  machine has. Sixteen `content:` declarations across ten stylesheets were typed
  glyphs (`✓` `→` `❯` `✦` `●`); a typed glyph has no shape of its own — the deck's type
  family carries none of them, so each machine substitutes a different font, a color
  emoji, or a hollow box. Governed by HARD RULE #29.
- **`lint:deck` now coaches typed glyphs instead of silently rendering them.** A `✓` in
  a deck gets a WARNING — never an error — naming what it will look like on another
  machine, the modifier that does it properly, and the concrete fix. Authors keep
  writing whatever they like; the linter offers the better option.
- **New `state-cells` modifier.** Puts the universal state markers (`[x]` `[-]` `[ ]`
  `[/]`) to work in ANY table's cells, not just `obligation-matrix` and `matrix-grid` —
  so a comparison table can carry the color-blind-safe status disc rather than a typed
  check.
- **The a11y and print status glyphs are deliberately unchanged.** They are the
  grayscale-safe shape channel for color-blind and toner-only readers, and the
  measurements behind them (empty-alt `content` is the only thing that keeps them out
  of the accessibility tree; the doubled declaration is a cross-engine pair) are
  recorded in `engineering/decisions/2026-08-25-typed-glyphs.md`.
