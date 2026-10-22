---
origin: 2852
priority: P3
recorded: 2026-10-22
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md
source: https://github.com/Laticent/lattice/pull/2852
---

# The logo looks bigger on some slides than on others in the office export.

```text
  P3 · [no ticket] The logo looks bigger on some slides than on others in the office export.
       why now   — the owner's desktop check of Bilan; the `logo-finish` size axis (`logo-sm` 0.75x, `logo-lg` 1.5x) may set it per slide in the deck, or
                   the export sizes each logo picture on its own.
       where     — docs/src/lib/calco/capture.ts (addLogo, cached per logoKey) and reader.ts (logoFound rect); compare
                   with the Chrome PDF before changing anything.
       done when — logo size matches the PDF on every slide; if the deck sets it per slide, the export says nothing is wrong.
       evidence  — logo width per slide in studio-bilan.pptx against the PDF.
       verify    — tier 0 gates.
```
