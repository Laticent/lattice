- **Added: `npm run parity:transforms` — evidence for collapsing the duplicated
  transformers.** Fifteen of the seventeen registry transformers carry two
  implementations of one restructure (a string rewrite for the engine, a DOM walk
  for the runtime), which is how the compare-code trailing-blockquote defect landed
  in both. The tool runs both over every gallery deck and classifies each
  difference as identical, equivalent re-serialization, or genuinely different. On
  the current corpus: 2 identical, 68 equivalent, **6 genuinely different** — real
  disagreements that exist today, including `video`, which builds a `cell-masthead`
  in the export and a `video-lead` in the preview.
- **Added: `lib/core/dom-provider`** — parse a rendered-HTML string into a DOM and
  serialize it back, using the parser the environment already has: the browser's
  native `DOMParser` (0.100 ms per slide, 0.9% of the Studio's edit→paint budget)
  and jsdom in Node. Not yet wired into the render path.
