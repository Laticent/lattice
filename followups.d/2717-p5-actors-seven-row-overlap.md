---
origin: 2717
priority: P5
recorded: 2026-10-16
area: inventory
severity: high
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §13
---

# the actors stress slide (gallery slide 3, hd) renders row titles over the descriptions in the visible output; found while rendering cards adoption

why now   — lib/components/inventory/actors/actors.styles.css (flex:1 rows with min-height:0 on a bounded stage)
where     — seven rows fit without overprint, or the ceiling is lowered to the measured count, in every theme and both schemes
done when — before/after image of the stress slide, light and dark; tools/pixel-check.js
evidence  — tier 0, with a demo deck per HARD RULE #9
verify    — 
