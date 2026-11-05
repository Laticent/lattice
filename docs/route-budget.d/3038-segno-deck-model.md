studio: +9216
home: +9216
playground: +9216
The Studio's slide boundaries (`lib/core/slide-boundaries.mjs`, loaded at startup) now come from the deck model, `@laticent/segno-markdown`: markdown-it's block rules ported onto a flat tape and held to markdown-it token for token. markdown-it stays in the bundle, because the outline's heading sections and the lint still read its tokens, so the model's ~8.5 KB gzipped adds rather than swaps; it comes back when P4 of the Segno deck pipeline lets the Studio drop markdown-it. Measured with two full docs builds, move held and applied: studio and playground eager JS about +8.5 KB, home +8.4 KB, lint core +8.8 KB. The owner chose this over waiting for P4 (D1 B on PR 3038) and raised the ceilings in their own PR.
