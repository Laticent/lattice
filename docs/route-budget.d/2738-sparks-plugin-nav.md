studio: +12
playground: +17
home: +15
The site navigation gains a Sparks row under Plugins (`docs/src/lib/nav.mjs`), now that sparks are a plugin with a catalog page. The nav ships in each route's eager chrome, so every route that carries it grows by the one gzipped entry (12–17 B as CI measured on fe9c314). Nothing to give back: the entry is the feature.
