---
origin: 2700
priority: P2
recorded: 2026-10-15
area: infra
severity: low
swimlane: engineering/decisions/2026-10-14-engine-spine.md §8
source: https://github.com/Laticent/lattice/pull/2700
---

# Decide whether to budget the sum of every chart kernel, not only the largest

why now   — chartKernelGz caps the largest kernel's closure (chart-map, 77.4KB gz). Any other
            kernel can grow unseen until it overtakes map: hub-spoke has 36KB of room first.
where     — docs/scripts/check-route-budget.mjs measureCharts; docs/route-budget.json.
done when — the owner has picked: add `chartKernelsGz` (the union of every kernel's closure
            beyond the engine) with soft/ceiling, or record why the largest is enough. A new
            metric is a number the owner sets (CLAUDE.md second filter).
evidence  — the measured union today, and a mutation that grows a non-largest kernel and fails.
verify    — tier 1 checker, because it changes what a CI gate finds.
