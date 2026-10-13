---
origin: 2673
priority: P2
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-13-compose-inline-notation-editors.md
source: https://github.com/Laticent/lattice/pull/2673
---

# The late fixes to the spark writer and door had no second checker pass

```text
  P2 · [no ticket] Run a second checker pass on the spark writer and insert door as they stand on main
       why now   — An independent checker found 8 defects in #2673 and all were fixed with regression tests, but the checker did not see the fixed code. The writer rewrites deck source, so a fix that introduced its own defect would corrupt a span. The checker also found that the writer's final field-by-field comparison is a backstop no tested input reaches (a 1.3M-case differential found no difference), so no test would notice if it were removed.
       where     — lib/core/inline-sparks.js (`editSpark` and helpers), docs/src/lib/compose/inline-objects.ts (`insertObject`, `insertBlocker`), test/unit/core/inline-sparks-edit.test.js.
       done when — a checker with no stake in the fixes has bug-hunted both, findings are fixed or answered, and either the backstop is pinned by a test or removed.
       evidence  — the checker's report, and any new mutation-checked test.
       verify    — tier 1 checker, because the writer rewrites deck source.
```
