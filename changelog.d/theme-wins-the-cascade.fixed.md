- **A palette's curated tokens now win over the engine's universal defaults in the
  export path.** `lattice-emulator.js` composed its document stylesheet as
  `palette + lattice`; both declare tokens at plain `:root`, so equal specificity meant
  source order decided and `base.tokens.css`'s defaults silently overrode everything the
  palette curated. Measured in Chromium by composing the real sheet both ways and
  diffing every computed custom property: **36 tokens on indaco, 48 on onyx, 52 on
  cuoio**, identical in light and dark — `--chart-state-*`, `--status-*`,
  `--pass`/`--warn`/`--fail` and their `-bg` mixes, the nine-stop `--seq-*` ramp,
  `--code-text`, `--code-inline-fg`, `--journey-stage-fg`, all twelve `--hljs-*` and the
  four `--on-dark-*` rungs. The engine's own `composeCss` inlines the base **at** the
  theme's `@import 'lattice'` site and has always been correct, so the two render paths
  disagreed about the cascade (HARD RULE #1) and the emulator was the one that was wrong
  — in exactly one of its three composition sites; its mermaid token parse and its
  svg-look scratch document already composed in the right order.
- Visible effect, per palette, on a probe deck: the **code panel on every palette**
  (`--code-text` + `--hljs-*`), the **status inks and inline-code chips** wherever a
  palette diverged from the base default, and **cuoio's title slide** — cuoio being the
  one palette that declared its own on-dark ramp, so this is the first time it applies.
  **Mermaid diagrams are unchanged**: they read tokens through
  `parsePaletteVars(layoutCSS + paletteCSS)`, already the correct order, so every
  palette's curated `--diagram-*` semantics were already rendering.
- Only `:root` token declarations move. The three palettes carrying real rules
  (`a11y-base`'s chart-status pseudos, `onyx`'s and `concrete`'s
  `section.dark:not(.print)` texture blocks) sit at selectors with no equal-specificity
  competitor in the layout CSS, so their precedence is unchanged — verified, not assumed.
