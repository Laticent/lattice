---
origin: 2772
priority: P1
recorded: 2026-11-10
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
source: https://github.com/Laticent/lattice/pull/3115
deferred: large — every shipped deck and doc, about 7,700 comments
---

# Step 5: lattice migrate meta over examples, galleries (separate post-review commit, #8), component docs, design and fixtures

lib/core/meta-migrate.mjs (migrateMetaSource) is the tested kernel: 4,296 comments in 355 files render byte-identical (test/integration/invariants/meta-record-identity.test.js); an inversion dry run converted 7,726 across every tracked .md with 0 kept. Owed: the CLI verb, merging a slide's adjacent records into one per scope, typed fields (layout/variant), and the sweep. Runs BEFORE the image plugin's lint:deck --fix sweep (session_01DPMMjG6h6Y1DziDhZNy6Af); message that session when it lands on main.

From the inversion on step 3: merging a slide's records must take the UNION of their class words, never let the last
win (the class is one value; `meta-class-overridden` reports the collision today).

```text
  P1 · [no ticket] Step 5: lattice migrate meta over examples, galleries (separate post-review commit, #8), component docs, design and fixtures
       why now   — the owner's order: the meta record ships before GA, steps in order 3, 4, 5, 6.
       where     — lib/core/meta-migrate.mjs, lattice.js, design §9 step 5
       done when — tools/pixel-check.js and PDF page counts unchanged over every deck
       evidence  — tools/pixel-check.js and PDF page counts unchanged over every deck
       verify    — tier 1 checker: mechanical, but every deck
```
