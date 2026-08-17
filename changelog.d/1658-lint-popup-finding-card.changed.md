- **The Studio's lint popup is a Lattice surface now, not library default chrome.** The
  hover card that reports an authoring problem is restyled as the Coach panel's finding
  card — a severity glyph and word beside the rule id, the message, then the fix as a
  filled accent pill on its own row — replacing `@codemirror/lint`'s stock interior (a
  5px `#d11`/`orange` rail and a `#444` button). Severity reads on three channels (glyph
  SHAPE, the word "Error"/"Warning"/"Note", and color) so it survives the `a11y-*`
  palettes, where the severity hues collapse toward one gray. On a touch device the card
  takes reading sizes and the fix becomes a full-width 44px target.
- **Both code editors now share ONE lint definition** (`docs/src/lib/lint-theme.js`). The
  Studio deck editor and the Playground each dressed the same `@codemirror/lint` DOM
  independently, so the two popups looked different and a fix to one skipped the other.
- **Fixed: the Playground's lint popup was an unthemed light box, dark mode included.**
  It never themed `.cm-tooltip`, so the popup fell through to CodeMirror's built-in
  `#f5f5f5` on every palette — body text on that fill measures 1.32:1 in dark mode, and
  the severity word 1.09:1. Both editors now share the shell as well as the interior.
- **Fixed: lint severity colors never tracked the palette.** The Playground painted the
  squiggle, the gutter marker and the panel with `--db-sev-error` / `--db-sev-warning` —
  tokens referenced in four places and **defined nowhere in the repo**, so their
  `#c0392b` / `#b8860b` fallbacks won on all 36 palette × mode combinations. They now use
  `--fail` / `--warn`, which every theme defines.
- **Fixed: the rule id could fall to 2.47:1.** Recessive ink in the popup was plain
  `--text-muted`, which drops below 3:1 against `--bg` on magnolia light (2.47:1) and
  cuoio light (2.64:1). It is now mixed 55% into `--text-body`, lifting all 36 rows past
  3:1 while still reading as secondary.
