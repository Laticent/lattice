- Every plugin library is now a copy its plugin owns, as Mermaid's became in #2557. function-plot
  (`lib/plugins/function-plot/vendor/function-plot.js`), KaTeX with its stylesheet and fonts
  (`lib/plugins/math/vendor/katex/`), and the CLI diagram bake's ZenUML and mermaid-cli render page
  (`lib/plugins/mermaid/vendor/`) ship from the plugin folder to every surface: the engine, the CLI
  export and bake, the HTML player, `dist/lattice.css` and the docs site. Each is pinned to an exact
  version, recorded with its SHA-256 in the manifest, and refreshed with `npm run vendor:plugins`;
  the build fails a copy that drifts. Gallery PDFs are byte-identical.
- Each vendored library's MIT `LICENSE` now ships beside its copy, Mermaid's included.
- Plugin manifests gain `vendor` for owned copies that are not the browser payload; a copy may be a
  file, a directory or one directory's files of one extension (spec/LPM.md §3.4).
- The CLI's warning for a plot whose library is missing now names the file and says to reinstall
  Lattice, since `npm install` no longer provides it.
- Fixed: the installed `lattice` command (the `dist/` bundle) exported every function plot showing
  its config since #2557, because it looked for the plugin's library one folder above the package.
  It now finds every plugin library from the package root, as the source entry does.
