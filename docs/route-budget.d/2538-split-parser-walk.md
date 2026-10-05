studio: +160
playground: +80
home: +70
The engine's shared tokenizer (lib/core/top-level-h2.mjs `walkStack`) now models foster parenting,
a stray `</p>` and the adoption agency's in-scope case, and the split kernel reads list items
through it (lib/core/split-panels.js), so the two split render paths read the same slots. Every
route that runs the engine carries that walk. The Studio also carries two read-time fixups in its
PDF export (`withSlide`), so its 4K export draws the slide's edge as a vector.
Given back first: the first cut copied the whole open-element stack on every start tag (`names()`);
that copy is gone.
CI measured this PR's growth three times while its code stayed the same: studio +82, +91, +108;
playground +50, +51, +47; home +38, +42, +42 (84db388, 4d2c4f8, 00773e6). CI builds the PR merged
into the current main, and main moved between those runs, so chunk boundaries and gzip shift
around the same added code. The lines above cover the highest reading with about 50% margin, so
the next move of main does not fail the PR again; the real growth is the ~0.1KB per route above.
