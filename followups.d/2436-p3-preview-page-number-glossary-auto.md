---
origin: 2436
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2436
---

# The Studio preview numbers a `glossary: auto` deck's slides one low after Previous

Found while checking the Studio preview of examples/mobile-landscape.md
(followups.d/2436-p3-studio-mobile-landscape-preview.md, which the canvas geometry passed). The
wrong number is not the canvas's: a three-slide 16:9 deck with `paginate: true` and a
`glossary: auto` registry, loaded in the Studio with the cursor on the last slide, shows slide
"Two" numbered **1** after one press of Previous slide; the same deck without `glossary: auto`
numbers it **2**. The PDF numbers both correctly. The preview shows the right slide; only the
page number is off. The glossary slide the render appends (lib/core/glossary-auto.mjs) is the
likely cause: the preview's slide index and the render's section count disagree by one.

```text
  P3 · [followups.d/2436-p3-preview-page-number-glossary-auto.md] number the preview's slides as the PDF does
       why now   — every `glossary: auto` deck (the Q3 fixture, examples/mobile-landscape.md) shows
                   wrong page numbers while it is being edited.
       where     — the Studio's single-slide preview render and its pagination
                   (docs/src/lib/single-slide-render.ts; StudioShell stepDeck); glossary-auto.mjs.
       done when — the preview's page number matches the PDF's on every slide of
                   examples/mobile-landscape.md, stepping with Previous and Next.
       evidence  — the preview's page number per slide beside the PDF's.
       verify    — tier 0 if the fix is in the Studio only; tier 1 if it touches the runtime.
```
