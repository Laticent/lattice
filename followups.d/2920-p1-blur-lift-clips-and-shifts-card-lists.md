---
origin: 2920
priority: P1
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-06-16-focus-highlighting.md §5
source: https://github.com/Laticent/lattice/pull/2920
---

# Take the lift off blur, or give every card list its berth

```text
  P1 · [no ticket] take the lift off blur, or give every card list its berth
       why now   — blur scales its target 1.02 and casts a hard shadow, so it shifts the layout the way the removed pop did, and the berth added in #2920 covers cards-grid only. Measured at 1280px, the lift is sheared by about 11.5px on cards-stack and checklist, 5.7px on verdict-grid, 3.6px on pricing and 2.5px on list-steps (read from a checker render, not fixed).
       where     — lib/base/base.focus.css (the blur li rule and the lift berth rule); engineering/decisions/2026-06-16-focus-highlighting.md §5.1.
       done when — blur only defocuses the rest and the target stays put (preferred, the owner called a shifting pop not boardroom), or every card list that clips has a berth; the overhang is 0 on all six lists.
       evidence  — the overhang measured at 1280px on cards-grid, cards-stack, checklist, verdict-grid, pricing and list-steps, before and after.
       verify    — tier 1 checker, because it edits the shared focus CSS every _focus slide uses. The look of blur changes, so ask the owner first.
```
