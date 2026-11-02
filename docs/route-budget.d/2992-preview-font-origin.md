studio: +94
playground: +93
home: +93
The preview frame's content security policy names the site's own origin for fonts (`previewCspMeta`, `docs/src/playground/preview-csp.js`). Firefox does not read a `srcdoc` frame's `'self'` as the site's origin, so it blocked every self-hosted face in the preview: the text faces fell back, and the icons, which now draw as Lattice Icons glyphs, drew nothing (engineering/decisions/2026-11-01-icon-font.md). The bytes are the origin check and the jsdom-bake exception, and (1 to 2 bytes) `subresourceCspPolicy` keeping that origin beside a KaTeX sheet's own instead of replacing it.
