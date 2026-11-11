studio: +10
home: +17
playground: +17
The Studio's preview frame now lets the site's own pictures load in Firefox: `previewCspMeta` (docs/src/playground/preview-csp.js, through lib/core/subresource-csp.mjs) names the host's own origin in `img-src` and `media-src` as well as `font-src`, because Firefox does not read a `srcdoc` frame's `'self'` as the site, and every `sample:` photo drew nothing there. CI measured `deck-preview` at +15 bytes against main on studio, home and playground; studio's other +18 is StudioIsland, of which 3126-placed-picture-rule.md already declares 25, so studio owes 8 more. Each line is rounded up by 2 for build noise.
