studio: +1200
playground: +1350
home: +60
The slide-metadata vocabulary (`lib/plugins/meta.generated.mjs`, `lib/core/meta-keys.mjs`) and the URL scheme allowlist (`lib/core/url-scheme.js`) now sit in the engine's shared closure, so every route that loads the engine carries them; the readers that kept their own key lists lost those lists in the same change. The lint core (studio, loaded after first paint) also grew; its ceiling is raised separately in `docs/route-budget.json`.
Given back first: the Studio-only structured edit lives in its own module (`lib/core/meta-edit.mjs`), the manifest prose is left out of the generated vocabulary, and the minified lint bundle's growth over main fell from 3.4KB to 2.2KB gzipped.
