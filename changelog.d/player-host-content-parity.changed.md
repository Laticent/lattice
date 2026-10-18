- **Changed: on the same browser build, the CLI and the Studio now write the same player file for a
  deck.** Everything matches except the time stamp, the signing hashes and the new `host` field
  (`cli` or `studio`) in the file's record. Both hosts read styles the browser computes, so a Studio
  export made in Safari or Firefox, or in another Chromium version than the CLI's, still differs.
  Measured on 25 example decks (math, diagrams, portrait sizes and a 234-slide 4K deck among them),
  with the Studio preview in light mode: every file matched byte for byte. Two exceptions remain: a
  deck with no `color-mode:` exports dark from the Studio when its preview is dark (the export panel
  defaults to what the preview shows), and a Mermaid fence inside a blockquote or a deeply indented
  list item draws in the Studio but ships as source from the CLI. Each fix:
  - Both hosts compose the deck sheet from the minified builds the docs site serves
    (`dist/lattice-min.css`, `dist/themes/<name>-min.css`). The CLI's player CSS gets shorter;
    the rules don't change, and its PDF pages render pixel-identical on the decks checked.
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
- **A deck with diagrams exported from the Studio as a Webpage is now the same file as the CLI's
  `--player`**, apart from the time stamp, the policy hashes and the new `host` field. The Studio
  draws a Gantt at the width the CLI draws it (784 px, where it used to span the slide) and ships
  each diagram in the CLI's baked shape. That is a trade: for Gantt and flowchart sizing, the Webpage
  export now matches the CLI's file rather than the Studio's own preview and PDF export, which still
  draw at the slide's width.
