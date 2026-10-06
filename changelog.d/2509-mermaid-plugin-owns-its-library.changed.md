- The Mermaid plugin owns its copy of the Mermaid library: `lib/plugins/mermaid/vendor/mermaid.min.js`,
  recorded in the plugin's manifest (`payload.vendored`: version and SHA-256). Every surface ships
  that one copy: the Studio and Playground pages, the CLI's diagram bake (which used to load a second,
  unminified build), the Marp kit and the Export-to-Marp bundle (still as `mermaid-v11-min.js`).
  Nobody downloads Mermaid, and an install cannot change it: `mermaid` is pinned to an exact version,
  the build fails a copy that stops matching its record, and `npm run vendor:plugins` refreshes the
  copy when we decide to upgrade. The repo-root `mermaid-v11-min.js` is gone. Diagram gallery PDFs are
  byte-identical.
- The diagram gallery's and `examples/gallery-jargon.md`'s `<script>` tags load the plugin's copy.
  For the diagram gallery that also fixes its VS Code preview: its two paths had pointed at files
  that did not exist since the galleries moved into bucket folders.
- Plugin manifests gain `payload.vendored` and plugin folders an in-tree `vendor/` (spec/LPM.md §2, §3.4).
