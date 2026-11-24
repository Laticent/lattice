studio: +3170
playground: +3074
home: +3120

What grew, measured by CI's per-PR check on 5dec7201 against `main` c3635999, and locally against the merge base
0fef07ac (studio +3192, playground +3070, home +3124). Segno P5a puts one CSS tokenizer on the eager path:
lib/core/css-tokens.js, the driver and readers (`rewriteCssUrls`, `cssUrls`, `cssCommaParts`, `cssImports`) over the
one generated CSS parser in lib/core/css-ref.generated.js, which now carries a second entry for every token. Three
docs readers on every route's eager path moved their `url()` regexes onto `rewriteCssUrls` (theme-fetch.ts,
single-slide-render.ts, snapshot-cache.js), so the routes carry the driver: about 2.5 KB gzipped (the CommonJS
tokenizer is 5,417 B minified and gzipped, its parser alone 2,924 B). It is CommonJS so Node 24 cannot race its two
load paths, and the docs build bundles a CommonJS module whole, so tree-shaking cannot trim it (`rewriteCssUrls`
alone would be 4,642 B of 5,163 B even as an ES module). No chunk moved from lazy to eager: the one new eager file,
theme-fetch.js, is code main already loads eagerly inside video-overlay.js. The owner chose this cost (one tokenizer
everywhere, option A of the P5a route question) on 2026-11-17.
