- **Fixed: a `</style>` in a deck's CSS no longer breaks out of the exported document.**
  The CLI's page scaffold embedded three caller-supplied stylesheets — the palette, the
  `--css` layout sheet, and the deck's own front-matter `style:` block — raw in one
  `<style>` element. A `<style>`'s content is HTML RAWTEXT, so it ends at the first
  `</style` even from inside a well-formed CSS comment: the element truncated (3,632
  bytes lost in the measured case, about 3,400 of them the engine's own layout rules) and
  the remainder was parsed as markup. In the emitted `.html` an injected
  `<link rel="stylesheet" href="…">` fired a cross-origin request the moment a recipient
  opened the file; in a `--player` export the assembler harvested that `<link>` into the
  shipped artifact, so it rode in every copy. Every `<style>` the emulator builds from
  caller CSS now runs it through `sanitizeStyleText`, which escapes only the element
  terminator. **Exported bytes are unmoved:** no stylesheet in the 179-sheet committed
  corpus contains the sequence, and the guard returns its input by identity — the `.html`
  and `.pdf` for two demo decks in light and dark are byte-identical before and after.
- **Fixed: the Studio's "Download as webpage" shipped the same beacon.** Its CSS prune
  (`player-prune-browser.ts`) is the browser twin of the CLI's and re-wraps pruned CSS into
  a fresh `<style>`. `prunePlayerCss` is a css-tree parse→generate, and css-tree normalizes
  `<\/style` straight back into a live terminator — so the guard applied where the document
  was assembled was undone at the re-wrap, in a document that is mounted in a same-origin
  frame and then handed to a recipient. Both re-wraps now re-sanitize.
- **Fixed: two more `<style>` blocks spliced into shared markdown carried the same hole.**
  A saved library theme's CSS (`embedThemeInMarkdown`) and a library component's CSS
  (`componentBlock`) are embedded in the markdown a recipient receives, in byte-identical
  shape to the finish block beside them that was already guarded. Rendering the theme
  block's own output through the CLI produced a live `<link rel="stylesheet">` and turned
  the theme's remaining CSS into markup. Both now guard the whole element body, since the
  theme/component name rides in the comment header and is free text too.
- **Changed: the HARD RULE #22 stylesheet gate now covers the export pipeline.** It scanned
  `docs/src` alone, so `lattice-emulator.js` and `lib/export/**` were not checked at all. Its
  roots are the three shipped document assemblers, and a new per-site check catches a
  `<style>` rebuilt from css-tree-pruned CSS — the shape a document-assembly marker cannot
  see. The one entry in `SANCTIONED_STYLE_SINK_EXEMPT` is gone: the export player's generator
  is guarded, so the exemption had become a sanction for a fix that already landed.
- **Added: `npm run test:diagnostics` and `npm run test:runtime`.** Both directories had
  tests but no `test:<scope>` script, so a commit staging only files in one of them failed
  the pre-commit hook with `Missing script`. A test now asserts every `test/unit/<dir>` has
  one, so the next gap fails a test rather than someone's commit.
