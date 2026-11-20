---
origin: 3362
priority: P3
recorded: 2026-11-20
area: engine
severity: low
deferred: off-path — the running footer's width in the split layouts; PR 3362 changes their coda, not their chrome
swimlane: engineering/decisions/2026-11-20-coda-and-marp-parity.md
source: https://github.com/Laticent/lattice/pull/3362
---

# The running footer is cut off in the narrow panel of split-panel and split-compare

```text
  P3 · [no ticket] give the split layouts' footer room, or wrap it
       why now   — a 54-character footer ("Confidential · prepared for the board, 14
                   October 2026") is truncated to "… 14 Octobe…" in the dark panel of
                   split-panel and split-compare, in the Lattice PDF and in the Marp
                   kit. The kit, at its `author` marker level, flags both slides
                   "Content clipped"; the engine does not flag it (measured 2026-11-20).
       done when — the footer reads whole on both layouts at default and panel-narrow
                   widths, or the truncation is a documented choice.
```
