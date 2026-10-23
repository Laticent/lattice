---
origin: 2861
priority: P3
recorded: 2026-10-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-21-compose-point-and-click.md
source: https://github.com/Laticent/lattice/pull/2861
---

# Compose change highlight: the owner picks the curve; then remove the two curves not picked

The change flash is built and ships on the recommended `settle` curve (`docs/src/lib/compose/change-flash.ts`; decision record §8d). Three curves are in the stylesheet so the owner can choose from the recordings in the PR: settle (150 ms in, 1.2 s hold, 1.6 s out), quick (100 ms, 0.5 s, 0.8 s) and linger (200 ms, 2.2 s, 2.4 s). The off-screen behavior shipped as a chip under the slide's sticky bar that scrolls on a tap, and never scrolls on its own; the owner confirms it or asks for another.

done when — the owner has picked a curve and confirmed or changed the chip; the `data-flash-curve` rules for the other two curves are deleted from `CHANGE_FLASH_CSS`; a dark-theme frame at phone width is added to the decision record.
