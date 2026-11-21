---
origin: 3362
priority: P3
recorded: 2026-11-20
area: engine
severity: low
deferred: blocked — the owner asked for a deeper assessment of image and collage before the caption rule reaches them (engineering/decisions/2026-11-20-coda-and-marp-parity.md, settled 2b)
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# Should an image or a collage caption its picture with the slide's note?

```text
  P3 · [no ticket] decide image and collage captions, then apply coda.caption or not
       why now   — every chart, diagram and video now draws the slide's note as its figure's
                   caption (coda.caption). image claims its trailing paragraph for its text
                   column and takes no note; collage takes a note in the band. The owner said
                   both have their own semantics and need a deeper look first.
       done when — for each of image and collage, a written answer (caption, band note, or
                   neither) with renders of each variant, and the manifest matching it.
```
