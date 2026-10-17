---
origin: 2761
priority: P2
recorded: 2026-10-17
area: infra
severity: low
swimlane: engineering/decisions/2026-10-17-bridge-spec-and-plugin-format.md
source: https://github.com/Laticent/lattice/pull/2761
---

# Build S1 of the bridge spec: the schema and the Marp declaration

```text
  P2 · Start S1 (note §12): the bridge declaration schema, a T1 that reads today's
       Marp ledger with the same meaning, and the two ledger test files moved onto it.
       The owner answered B1–B4 on 2026-10-17 (yes to each recommendation, note §14), so this is unblocked.
       why now   — every later bridge (Calco) and phase E's zip format build on this contract
       where     — engineering/decisions/2026-10-17-bridge-spec-and-plugin-format.md §4, §5, §12;
                   lib/core/marp-fidelity.js; test/unit/core/marp-fidelity.test.js and
                   marp-fidelity-render.test.js
       done when — T1 passes on the unchanged ledger (32 rows: 13 mirrored, 6 baked, 11
                   unmirrored, 2 moot) and the 34 existing tests still pass with no behavior change
       evidence  — the test run before and after; the generated bundle README identical byte for byte
       verify    — tier 1 checker, because it moves a gate that other work reads
```
