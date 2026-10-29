---
origin: 2923
priority: P2
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §6
---

# Fluid P2: rescue-20-30 on the Playground, chosen on the fit-everywhere harness

why now   — the harness (engineering/decisions/2026-10-28-fit-everywhere-model.md §4) scores split policies on every real deck, perturbed, at every box and venue; P2 builds the winner. It closes #506 for the Playground.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §13.1 (the hybrid) and 2026-10-28-fit-everywhere-model.md §4-§6.
done when — the Playground splits with the owner's pick (D1 A, hysteresis-20-30) plus the compact-spacing clip rescue (rescue-20-30, 2026-10-28-fit-everywhere-model.md §8): a slide splits only on a measured overflow at the venue's size, an edit keeps the last plan in memory (20% to stay whole the first time, 30% to rejoin), and a slide whose pages would clip renders whole with `compact` spacing when that fits. No plan file and no type size change (§5). A cold export decides fresh and the same deck always gives the same pages. It holds the harness's numbers on the Playground: no new clip or lost leaf against today's split, and the same plan on CI and in the sandbox.
            The policy also splits a 16:9 box when it overflows at its venue: today's split never splits a wide box, and at `hall` 435 of 1,158 gallery slides clip there; the rescue fits 65 of them (§7, §8).
evidence  — the harness's scored tables before and after, montages at each box and venue in light and dark, three-width screenshots.
verify    — npm run build:check; a tier 1 checker on the scorer and on the engine change.
