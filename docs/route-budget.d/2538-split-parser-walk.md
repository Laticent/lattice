studio: +96
playground: +56
home: +47
The engine's shared tokenizer (lib/core/top-level-h2.mjs `walkStack`) now models foster parenting,
a stray `</p>` and the adoption agency's in-scope case, and the split kernel reads list items
through it (lib/core/split-panels.js), so the two split render paths read the same slots. Every
route that runs the engine carries that walk. The Studio also carries two read-time fixups in its
PDF export (`withSlide`), so its 4K export draws the slide's edge as a vector.
Given back first: the first cut copied the whole open-element stack on every start tag (`names()`);
that copy is gone.
CI measured +82/+50/+38 on 84db388 and +91/+51/+42 on 4d2c4f8, with no code change between the two:
gzip moves by a few bytes as neighbouring code shifts. The lines above are the second reading
plus 5 bytes of that variation, so a later measurement does not fail this PR again.
