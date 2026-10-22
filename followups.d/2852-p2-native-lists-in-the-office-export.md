---
origin: 2852
priority: P2
recorded: 2026-10-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md
source: https://github.com/Laticent/lattice/pull/2852
---

# Native lists in the office export.

```text
  P2 · [no ticket] Native lists in the office export.
       why now   — Each list item is a text paragraph and its bullet or number is a small separate picture (13 px sprites on the Bilan deck). Write native bullets and numbering instead.
       where     — lib/components lists via docs/src/lib/calco/reader.ts (list-marker items), pptx.ts (a:buChar, a:buAutoNum), odp.ts (text:list)
       done when — a list in the editable .pptx and .odp is real list paragraphs: adding or reordering an item keeps the marker, and no marker pictures remain
       evidence  — the Bilan deck slides 8, 18 and 31 exported before and after, and the picture count per slide
       verify    — tier 1 maker-checker: it changes both writers and the reader
```
