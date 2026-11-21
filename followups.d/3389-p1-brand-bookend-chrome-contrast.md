---
origin: 3389
priority: P1
recorded: 2026-11-21
area: theming
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: off-path — an engine/preset fix; #3389 adds the gate that found it and changes no engine CSS
source: https://github.com/Laticent/lattice/pull/3389
---

# Brand-forward's running chrome falls below AA on its dark bookends

The preset judging gate's baseline (`node tools/preset-gate.js --preset brand`, 2026-11-21) fails
Brand-forward on text contrast in all three rows. The running header and footer on the title,
both dividers and the closing measure 4.00 to 4.08:1, and the split-panel lede 4.03:1, against
the 4.5:1 floor. The brightest footer pixel on the title reads 4.20:1 (`145,167,194` on
`6,67,108`): the `strata` finish's corner glow lifts the navy under the chrome. On Classic the
same chrome measures 4.58:1.

Brand-forward's foot band is raised in wave 2 (§8 Phase 4), which may be where this lands.

done when — `node tools/preset-gate.js --preset brand --keep-going` reports 0 text runs below 4.5:1
in own, flip and house, and Classic, Editorial and Minimal still pass with 0 pages moved against
the 2026-11-21 baseline.
