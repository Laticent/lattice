---
origin: 2852
priority: P3
recorded: 2026-10-22
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md
source: https://github.com/Laticent/lattice/pull/2852
---

# The Studio's office export ignores a deck's own `style:` block.

```text
  P3 · [no ticket] The Studio's office export ignores a deck's own `style:` block.
       why now   — a probe deck with `style: section { background: #ff00ff !important; }` exports from the Studio with
                   a white slide, while the CLI honors it. The Bilan deck's logo-plate override never reached the Studio
                   export, which is why its logos showed a plate there (#2856 removed the need).
       where     — docs/src/components/studio/share-export.ts (buildDeckRender: which CSS rides with the render) and the
                   capture frame in docs/src/components/studio/export/deck-export.js; first check whether the Studio
                   preview applies the block, since a deliberate sanitizer would make this by design.
       done when — either the export applies the deck's style block like the CLI, or the Studio says it does not and why.
       evidence  — the probe deck exported from the Studio and the CLI, a slide pixel from each.
       verify    — tier 1 maker-checker: author CSS reaches a rendered document, so HARD RULE #22 applies.
```
