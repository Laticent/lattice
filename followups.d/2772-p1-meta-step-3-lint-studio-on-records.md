---
origin: 2772
priority: P1
recorded: 2026-11-10
area: engine
severity: high
swimlane: engineering/decisions/2026-10-17-meta-record.md §9
source: https://github.com/Laticent/lattice/pull/3115
deferred: large — the linter, editor completion, drawer, Compose and a new check-ownership gate; a PR of its own
---

# Step 3: lint, completion, the drawer and Compose on records, the D11 gate, the scanMetaSource keystroke bench

Records are live in the engine but the Studio rail, completion, drawer writes and Compose do not edit them; the drawer is read-only on a record slide. Folds in followups.d/2772-p2-decide-the-pane-marker-readers-at-the-step-2-door.md (three lint gaps). Typed core-register fields (finish=, headline=, rule=…) land here too.

```text
  P1 · [no ticket] Step 3: lint, completion, the drawer and Compose on records, the D11 gate, the scanMetaSource keystroke bench
       why now   — the owner's order: the meta record ships before GA, steps in order 3, 4, 5, 6.
       where     — lib/authoring/lint-core.js, lib/core/meta-edit.mjs writeMeta, docs/src/lib/compose/, design §6 and §9 step 3
       done when — a record slide edits in the drawer and Compose as a directive slide does; the D11 gate fails a deliberate violation; bench numbers for scanMetaSource per keystroke
       evidence  — a record slide edits in the drawer and Compose as a directive slide does; the D11 gate fails a deliberate violation; bench numbers for scanMetaSource per keystroke
       verify    — tier 2 trio: shared kernel and the authoring surface every deck uses
```
