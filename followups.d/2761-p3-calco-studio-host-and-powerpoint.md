---
origin: 2761
priority: P3
recorded: 2026-10-17
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-17-bridge-spec-and-plugin-format.md
source: https://github.com/Laticent/lattice/pull/2761
---

# Run a Calco file through the Studio host, LibreOffice and a real PowerPoint

```text
  P3 · The bridge spec's harness sketch measured Calco only on the CLI host, and only through
       LibreOffice. Run the same decks through the Studio host (the html-to-image camera) and open the
       resulting .pptx in a real PowerPoint, then record what each surface shows.
       why now   — Calco's `pictured` rows are claims about a rasterizer, and the Studio uses a
                   different one; a rendered-slide declaration (S3) is keyed to bridge and host,
                   so `calco@studio` has no measurement and `calco@cli` has only a LibreOffice one.
       where     — docs/src/components/studio/export/deck-export.js (the Studio capture path);
                   lib/export/office-export.js (the CLI path); the sketch,
                   engineering/decisions/2026-10-15-bridges-and-two-hosts/bridge-harness-sketch.mjs;
                   note §3, §6 and §12 (S3) of engineering/decisions/2026-10-17-bridge-spec-and-plugin-format.md
       done when — for the same six decks as the sketch (a11y, auto-glossary, anima-scene,
                   pane-layouts, chart-lead-blocks, accent-finishes): the Studio host's .pptx is
                   scored by the text and pixel checks next to the CLI host's; each deck's .pptx is
                   opened in a real PowerPoint and in LibreOffice and screenshotted per slide; any
                   difference between the three surfaces is written into the note as a row of its own
       evidence  — per-slide screenshots from real PowerPoint (a person or a desktop session must
                   open the file; say UNVERIFIED if no PowerPoint is reachable), the Studio-host
                   scores in a results JSON beside the sketch's, sent via SendUserFile
       verify    — tier 1 checker, because the numbers decide which Calco rows can be declared `native`
                   or `pictured` and a wrong row ships a wrong README
```
