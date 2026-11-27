studio: +3300
playground: +3175
home: +3225

What grew, measured by CI's per-PR check on 254a4143 against `main` 23524fc4 (studio +3198, playground +3075, home
+3124), on 5dec7201 against c3635999 (+3170, +3074, +3120), and locally against 0fef07ac (+3192, +3070, +3124). Each
line carries about 100 bytes of margin, because the same bytes measure a few bytes apart as main's chunks shift. Segno P5a puts one CSS tokenizer on the eager path:
lib/core/css-tokens.js, the driver and readers (`rewriteCssUrls`, `cssUrls`, `cssCommaParts`, `cssImports`) over the
one generated CSS parser in lib/core/css-ref.generated.js, which now carries a second entry for every token. Three
docs readers on every route's eager path moved their `url()` regexes onto `rewriteCssUrls` (theme-fetch.ts,
single-slide-render.ts, snapshot-cache.js), so the routes carry the driver: about 2.5 KB gzipped (the CommonJS
tokenizer is 5,417 B minified and gzipped, its parser alone 2,924 B). It is CommonJS so Node 24 cannot race its two
load paths, and the docs build bundles a CommonJS module whole, so tree-shaking cannot trim it (`rewriteCssUrls`
alone would be 4,642 B of 5,163 B even as an ES module). No chunk moved from lazy to eager: the one new eager file,
theme-fetch.js, is code main already loads eagerly inside video-overlay.js. The owner chose this cost (one tokenizer
everywhere, option A of the P5a route question) on 2026-11-17.
