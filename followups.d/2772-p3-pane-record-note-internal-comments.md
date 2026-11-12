---
origin: 2772
priority: P3
recorded: 2026-11-11
area: engine
severity: low
swimlane: engineering/decisions/2026-10-17-meta-record.md §5.4
source: https://github.com/Laticent/lattice/pull/3115
deferred: off-path — invisible (HTML comments only, no rendered or exported change found); found by the widened identity test, in step 2's pane carve, which this PR does not touch
---

# A pane record that also carries a note renders the carve's internal comments into the HTML

`<!-- {pane=list, note="…"} -->` (the second pane of `examples/meta.md`) renders `<!-- lat-panes: 50/50 heads -->` and
`<!-- lat-pane: {…} -->` inside that pane's stage; the same slide written `<!-- _pane: list -->` then `<!-- … -->` does
not. With HTML comments removed the two renders differ only in blank lines. The comment form of such a record is left
out of the byte-identity test (`recordsToComments` `legacy`) until the carve consumes its markers when a note shares the
record's line range (lib/engine/slides.js `lattice_meta_expand`, lib/core/panes.js).

```text
  P3 · [no ticket] A pane record with a note echoes the carve's internal comments
       why now   — the cut (step 6) makes the record the only spelling, so this shape becomes the only way to write it.
       where     — lib/engine/slides.js lattice_meta_expand, lib/core/panes.js
       done when — the identity test needs no pane-and-note exception in recordsToComments' legacy form
       evidence  — test/integration/invariants/meta-record-identity.test.js with the exception removed
       verify    — tier 1 checker
```
