- **Changed: the CLI and the Studio now write the same player content and metadata for a deck.**
  Parity means everything matches except the time stamp, the signing hashes and the new `host`
  field (`cli` or `studio`) in the file's record. Measured on 12 example decks, the five without
  math, diagrams or a portrait size now match fully. Each fix:
  - Both hosts compose the deck sheet from the minified builds the docs site serves
    (`dist/lattice-min.css`, `dist/themes/<name>-min.css`). The CLI's player CSS gets shorter;
    the rules don't change, and its PDF pages render pixel-identical.
  - The Studio builds its document from the CLI's own scaffold (`lib/export/export-scaffold.js`),
    so its players carry the page-number rule, the deck's `style:` block, and only the texture
    patterns the page uses.
  - The Studio's Outfit 400/700, Caveat and Shantell 400/700 fonts are now the engine's files.
    Before, it drew those weights from other files, which also changes its live preview and
    image exports. `fonts:check` now holds the vendored files to the engine's bytes.
  - Studio exports record the real engine and player versions and the deck's front-matter
    settings, where they recorded `studio` and nothing.
  - The Studio's bake keeps each slide's inline style as the engine wrote it, without the
    preview's size stamps.
