- **Breaking:** every minified file Lattice builds or ships now uses a `-min` suffix instead of
  `.min`, because the dotted form trips tools that read the part after the first dot as the file
  type. `dist/lattice.min.css` is now `dist/lattice-min.css`, `dist/lattice-runtime.min.js` is
  `dist/lattice-runtime-min.js`, and the same holds for `lattice-default`, `lattice-dagre`,
  `lattice-emulator`, `lattice-pdf-compose`, every `dist/themes/<name>-min.css`, the vendored
  `mermaid-v11-min.js`, and the Marp kit on the `dist-kits` branch. The package subpaths
  (`@laticent/lattice/css/min`, `/runtime/min`, `/default/min`, `/min`) keep their names and
  now point at the new files. **Update any `<link>`, `<script src>`, CDN URL, or
  `markdown.marp.themes` entry that names a `.min` file.** Third-party files read from
  `node_modules` (KaTeX's `katex.min.css`, Mermaid's `mermaid.min.js`) keep their upstream names.
- Decks and package galleries written before the rename keep working where Lattice reads them
  back: re-exporting a deck baked with the old `.min.js` runtime tags to Marp swaps them for the
  new `-min.js` block instead of stacking a second one, the CLI still strips an old-name runtime
  tag from its export HTML, and a gallery that loads `mermaid-v11.min.js` still passes the
  vendored-script gate.
