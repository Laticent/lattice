---
origin: 2378
priority: P3
recorded: 2026-09-25
---

# Six declared `hard` capacities sit above what the rig measures at the designed size

why now   — found while measuring SCALE_CAPACITY, not caused by #2378. At `wide`, density.soft, `node tools/calibrate-capacity.js --all --family wide` measures authority-chain 4 (hard 6), kpi 3 (4), pricing 3 (4), q-and-a 4 (6), regulatory-update 4 (6), team-profile 6 (12). `capacity-overflow` therefore stays silent on slides in that gap. 2026-07-28-capacity-basis.md argues the count ceiling is ill-defined, so this may be a ruling rather than a fix.
where     — the six manifests' `capacity` / `adapt.capacity.wide`; engineering/decisions/2026-07-28-capacity-basis.md.
done when — each of the six either has `hard` at or below its measured ceiling, or the basis note records why it stays above.
evidence  — the calibrate-capacity run before and after.
verify    — tier 1: `node tools/calibrate-capacity.js --all --family wide` exits 0.
