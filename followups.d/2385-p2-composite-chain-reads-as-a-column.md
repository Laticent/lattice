---
origin: 2385
priority: P2
recorded: 2026-09-27
area: chart
severity: medium
swimlane: engineering/decisions/2026-09-25-flowchart-authoring.md
---

# A long machine with a composite state lays out as one unreadable column

```text
  P2 · [no ticket] Let a graph chart with a group wrap into rows, as a chain without one does.
       why now   — a 12-state incident machine with one composite ("Response") exports at
                   2.9 pt (the TYPE FLOOR warning fires; the Studio flags "TEXT TOO SMALL").
                   The same states without the composite lay out legibly over three rows.
                   The kernel's wrap/grid candidate refuses a model with groups, so only
                   dagre's single-rank layouts compete, and a long chain ranks into a strip.
                   Composites are new in v2, so no shipped deck regressed; an author meets
                   it the first time they group a long machine.
       where     — docs/src/lib/trama/kernel.ts: `wrapped()` / the grid candidates (groups
                   as blocks that stay contiguous in a row), shared with the flowchart.
       done when — the repro (.scratch/typing/large-v2.md in the PR body) exports at or
                   above the 5.4 pt floor with the composite drawn around its states.
       evidence  — the repro before/after, light and dark; the fuzz corpus counts.
       verify    — tier 2 (kernel change on both charts): maker-checker.
```
