---
origin: 2710
priority: P4
recorded: 2026-10-15
area: code
severity: low
swimlane: engineering/decisions/2026-10-15-code-plugin.md §7
source: https://github.com/Laticent/lattice/pull/2710
---

# lint:deck does not check a `@code{…}` record inside a blockquote

why now   — the render applies a record written inside `>`, but findCodeRecords scans unquoted lines only, so a bad record or line range there is silent (the checker's finding on #2710).
where     — lib/authoring/lint-core.js findCodeRecords; lib/plugins/code/shared/read-fences.js already reads quoted fences.
done when — a record inside a blockquote gets the same four rules as an unquoted one.
evidence  — a unit test in test/unit/plugins/code-record.test.js with a quoted record and a bad range.
verify    — node --test test/unit/plugins/code-record.test.js
