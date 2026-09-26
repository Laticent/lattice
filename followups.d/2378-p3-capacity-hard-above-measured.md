---
origin: 2378
priority: P3
recorded: 2026-09-25
---

# Seven declared `hard` capacities sit above what the rig measures at the designed size

why now   — found while measuring SCALE_CAPACITY, not caused by #2378. At `wide`, density.soft, `node tools/calibrate-capacity.js --all --family wide` measures authority-chain 4 (hard 6), kpi 3 (4), pricing 3 (4), q-and-a 4 (6), regulatory-update 4 (6), team-profile 6 (12), and — after #2380 re-laid out `list` — list 3 (6). `capacity-overflow` therefore stays silent on slides in that gap. 2026-07-28-capacity-basis.md argues the count ceiling is ill-defined, so this may be a ruling rather than a fix.
where     — the seven manifests' `capacity` / `adapt.capacity.wide`; engineering/decisions/2026-07-28-capacity-basis.md.
done when — each of the seven either has `hard` at or below its measured ceiling, or the basis note records why it stays above.
evidence  — the calibrate-capacity run before and after.
verify    — tier 1: `node tools/calibrate-capacity.js --all --family wide` exits 0.

rechecked — 2026-09-26, after #2386 opted the card catalog into `cards:`: STILL OPEN, unchanged.
            `node tools/calibrate-capacity.js <c> --family wide` measures authority-chain 4 (hard 6),
            kpi 3 (4), pricing 3 (4), q-and-a 4 (6), regulatory-update 4 (6), team-profile 6 (12),
            list 3 (6; its sweet 5 and soft 6 are also above the ceiling). No manifest moved. Related:
            list.gallery p9, an 8-line "hard ceiling" stress slide, is one of the clips in
            `2378-p2-new-gallery-clips-2377-2380.md`.
