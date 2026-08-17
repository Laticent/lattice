- **Fixed: a `</style>` in a deck's CSS no longer breaks out of the exported document.**
  The CLI's page scaffold embedded three caller-supplied stylesheets — the palette, the
  `--css` layout sheet, and the deck's own front-matter `style:` block — raw in one
  `<style>` element. A `<style>`'s content is HTML RAWTEXT, so it ends at the first
  `</style` even from inside a well-formed CSS comment: the element truncated (dropping
  3,606 bytes of the engine's own layout rules in the measured case) and the remainder
  was parsed as markup. In the emitted `.html` an injected
  `<link rel="stylesheet" href="…">` fired a cross-origin request the moment a recipient
  opened the file; in a `--player` export the assembler harvested that `<link>` into the
  shipped artifact, so it rode in every copy. All four of the emulator's `<style>` sites
  now run their CSS through `sanitizeStyleText`, which escapes only the element
  terminator. **Exported bytes are unmoved:** no stylesheet in the 179-sheet committed
  corpus contains the sequence, and the guard returns its input by identity — the `.html`
  and `.pdf` for a demo deck are byte-identical before and after.
- **Changed: the HARD RULE #22 stylesheet gate now walks the export pipeline.** It
  scanned `docs/src` alone, so `lattice-emulator.js` and `lib/export/**` were not checked
  at all. Its roots are the three shipped document assemblers; the one entry in
  `SANCTIONED_STYLE_SINK_EXEMPT` is gone, because the export player's generator is now
  guarded and the exemption had become a sanction for a fix that already landed.
- **Added: `npm run test:diagnostics` and `npm run test:runtime`.** Both directories had
  tests but no `test:<scope>` script, so a commit staging only files in one of them failed
  the pre-commit hook with `Missing script`.
