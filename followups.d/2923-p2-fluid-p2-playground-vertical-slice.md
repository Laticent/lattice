---
origin: 2923
priority: P2
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §6
---

# Fluid P2: the hybrid on the Playground, tuned on the fit-everywhere harness

why now   — the harness (engineering/decisions/2026-10-28-fit-everywhere-model.md §4) scores split policies on every real deck, perturbed, at every box and venue; P2 builds the winner. It closes #506 for the Playground.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §13.1 (the hybrid) and 2026-10-28-fit-everywhere-model.md §4-§6.
done when — the harness scores today's split as a baseline with a measured run time; the finalists are shown to the owner with montages; the chosen policy splits only on a measured overflow at the venue's size and packs members per page on the Playground, with no clip and no lost content in the harness, and the same plan on CI and in the sandbox.
evidence  — the harness's scored tables before and after, montages at each box and venue in light and dark, three-width screenshots.
verify    — npm run build:check; a tier 1 checker on the scorer and on the engine change.
