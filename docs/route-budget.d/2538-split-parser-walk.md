studio: +82
playground: +50
home: +38
The engine's shared tokenizer (lib/core/top-level-h2.mjs `walkStack`) now models foster parenting,
a stray `</p>` and the adoption agency's in-scope case, and the split kernel reads list items
through it (lib/core/split-panels.js), so the two split render paths read the same slots. Every
route that runs the engine carries that walk. The Studio also carries two read-time fixups in its
PDF export (`withSlide`), so its 4K export draws the slide's edge as a vector.
Given back first: the first cut copied the whole open-element stack on every start tag (`names()`);
that copy is gone.
