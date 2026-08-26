- **Added: `lib/core/dom-provider`** — parse a rendered-HTML string into a DOM and
  serialize it back, using the parser the environment already has: the browser's
  native `DOMParser` (0.100 ms per slide, 0.9% of the Studio's edit→paint budget)
  and jsdom in Node. Groundwork for collapsing the fifteen transformers that carry
  two implementations of one restructure. Not yet wired into the render path.
- **Added: `npm run parity:transforms`** — runs both implementations of every
  registry transformer over the gallery corpus and classifies each difference.
  Currently a report, and explicitly **not yet trustworthy**: it calls
  `applyAllToDom` without the runtime's front-matter and form-class pre-steps, so
  most of what it flags is that gap rather than a real disagreement. The tool and
  its decision note both say so.
