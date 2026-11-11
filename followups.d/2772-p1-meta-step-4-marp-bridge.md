---
origin: 2772
priority: P1
recorded: 2026-11-10
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
source: https://github.com/Laticent/lattice/pull/3115
deferred: large — the escaping table, Lattice-only keys, both producers' order, a marp-cli and VS Code proof
---

# Step 4: the full Marp bridge, both producers, one pass list

PR 3115 ships an interim (recordsToComments): records back to directive comments, quoted YAML values. Owed: §7's full escaping table, Lattice-only keys Marp shows as notes (_focusSteps today, in either spelling), the Studio producer's lift order, and a real marp-cli render plus the VS Code preview.

```text
  P1 · [no ticket] Step 4: the full Marp bridge, both producers, one pass list
       why now   — the owner's order: the meta record ships before GA, steps in order 3, 4, 5, 6.
       where     — lib/core/meta-door.mjs recordsToComments, tools/export-marp.js, docs/src/components/studio/export/deck-export.js, design §7
       done when — a marp-cli PDF of examples/meta.md shows every layout, and its notes hold no record or Lattice-only key
       evidence  — a marp-cli PDF of examples/meta.md shows every layout, and its notes hold no record or Lattice-only key
       verify    — tier 2 trio: export bytes in a third-party renderer
```
