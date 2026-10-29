studio: +2363
playground: +2363
home: +2363
The web-reference scanner reads CSS through a generated Segno parser (lib/core/css-ref.generated.js, about 2.6 KB gzip) in place of a hand-written tokenizer, so _astro/remote-ref.js grows by 2,363 gzip bytes as CI measures it, on every route that imports it. The owner approved raising the Studio ceiling for it (D1 A on #2980); only that ceiling moves, 559719 to 562200.
