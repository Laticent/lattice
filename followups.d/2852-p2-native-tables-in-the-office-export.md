---
origin: 2852
priority: P2
recorded: 2026-10-22
area: engine
severity: low
swimlane: engineering/decisions/2026-10-21-calco-lift-what-can-be-lifted.md
source: https://github.com/Laticent/lattice/pull/2852
---

# Native tables in the office export.

```text
  P2 · [no ticket] Native tables in the office export.
       why now   — A table is per-cell text frames with rules and fills as shapes. Write a native table (a:tbl, table:table) if the fidelity trade is acceptable: PowerPoint and Google Slides recompute row heights, so a table can shift from Chrome's layout. Owner decides the trade after a measured sample.
       where     — docs/src/lib/calco (reader.ts table detection, pptx.ts and odp.ts writers); start from a measured sample deck
       done when — the owner has chosen native or cell frames per measured row-height shifts; if native, a table in both formats edits as a table
       evidence  — row heights Chrome vs LibreOffice 24.2 and 26.2 on a sample table deck
       verify    — tier 2 adversarial trio: it changes the layout contract of every table
```
