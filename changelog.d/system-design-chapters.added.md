- **Added: `examples/system-design/`, the 232-slide system-design tutorial cut into
  thirteen standalone chapter decks.** `examples/system-design-foundations.md` is one
  file and one 233-page PDF, so a reader who wants the network kit carried the other
  221 slides to get it. The thirteen chapters follow the seams the deck already drew —
  its seven Parts, with Part four (108 slides, 46% of the deck on its own) opened out
  into its six kits: data 44, compute 10, network 11, scale 12, reliability 13,
  security 18. Each chapter stands alone: its own title slide, an agenda marking which
  of the deck's six movements it sits in, an orientation slide naming what it assumes
  from the chapters before it, the omnibus slides verbatim, and a closing slide
  pointing at the next chapter. Chapter thirteen ends on the deck's own closing slide
  rather than a second one.
- **The chapters are GENERATED from the omnibus, not copied.** The omnibus stays the
  single source of every slide body a reader sees, so a prose fix lands once and
  cannot diverge between the two forms; `tools/build-system-design-chapters.js` owns
  the wrapper slides and the cut, and `build:check` fails on a stale, missing or
  orphaned chapter. Chapters are located by the eyebrow of the divider slide they open
  on, never a slide index, so inserting a slide cannot silently move a cut. The
  splitter is fence-aware and asserts that rejoining its slides reproduces the deck
  byte for byte.
- **Each chapter's acronym registry is trimmed to the terms that chapter says.** That
  is load-bearing rather than tidy: `glossary: auto` renders every registry entry
  carrying a `definition` (`lib/core/glossary-auto.mjs` `glossaryEntries`), so an
  untrimmed copy would have ended all thirteen PDFs with the same appendix, defining
  terms the chapter never used. The network chapter keeps 4 of the omnibus's 21 terms;
  three chapters define none and correctly render no glossary at all. What counts as
  "said" is the text a reader meets: inside a mermaid fence only the labels count, so a
  node identifier (`PUSH --> CI([...])`) and a direction keyword (`flowchart TB`) earn
  nothing, while a node LABEL does. Every term each chapter keeps was checked against
  that chapter's rendered PDF text — 33 kept terms across the thirteen, none of them
  absent from a rendered page.
- **New script `chapters:system-design`.** Rebuilds the chapters and their index from
  the omnibus. The thirteen chapter PDFs are rebuilt by the existing pre-commit
  staged-PDF hook, not by `npm run build` — thirteen real Chromium renders do not
  belong in the build.
