---
origin: 2772
priority: P1
recorded: 2026-11-10
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
source: https://github.com/Laticent/lattice/pull/3115
deferred: large — breaking, every deck and test that writes a directive comment
---

# Step 6: the cut — the engine stops reading authored directive comments

Put D3 (hard or soft cut) back to the owner first, with the measured cost (design §9 Status, the cut paragraph): the expansion speaks the legacy form inside the engine, so the cut works at the door or through token.meta.latticeRecord, never in the shared grammar. Then a **Breaking:** fragment, the legacy-directive-comment lint and autofix on, notes-core keeping a legacy comment out of the notes, and design/skills teaching the record (the cold-writer test: 20 of 36 slides in the old form).

```text
  P1 · [no ticket] Step 6: the cut — the engine stops reading authored directive comments
       why now   — the owner's order: the meta record ships before GA, steps in order 3, 4, 5, 6.
       where     — lib/plugins/meta/meta.source.mjs, lib/engine/slides.js, design/skills/, design §9 step 6 and §13.4
       done when — build:check; a deck written in directive comments renders the default layout with the lint warning and its fix
       evidence  — build:check; a deck written in directive comments renders the default layout with the lint warning and its fix
       verify    — tier 2 trio: breaking, every deck
```
