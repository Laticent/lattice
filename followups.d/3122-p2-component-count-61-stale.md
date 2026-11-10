---
origin: 3122
priority: P2
recorded: 2026-11-10
area: docs
severity: low
swimlane: engineering/development.md
deferred: off-path — doc counts across many surfaces; this PR touched only the kit's own claims
source: https://github.com/Laticent/lattice/pull/3122
---

# "61 components" is stale across the docs: the catalog holds more (80 at 2026-11-10)

```text
  P2 · re-derive the component count everywhere it is written
       why now   — PR 3122 fixed the kit's count (80, held by a test to the catalog) and found the old number in
                   package.json `description`, design/design-system.md (2 places),
                   engineering/marp-independence.md (2), engineering/development.md (the
                   "61 components / 14 themes" example) and examples/split-structure.md.
                   Changelog fragments and decision notes are history and keep their number.
       done when — every live surface states the catalog's count (or the count is generated from the catalog, as
                   check-ownership already prints it), and grep finds "61 components" only in
                   dated records.
       verify    — tier 0; `npm run check:ownership` prints the current count.
```
