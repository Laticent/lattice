---
origin: 2923
priority: P1
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P1
---

# Fluid P1: the @laticent/fluido pure core (structural plan + budget line rescue), families.js moved in whole

why now   — P2 to P7 build on plan(); the budget line rescue keeps code slides from regressing at P3.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P1.
done when — docs/src/lib/fluido exists with a boundary gate like checkMosaicoBoundary; splitDoc is a connector over plan(); the P0 parity golden is byte-identical; the page cap (64) is measured against the largest gallery; the Libraries page has a Fluido entry like Mosaico's (docs/src/content/catalog/libraries/fluido.md, a page under docs/src/pages/libraries/fluido/, the committed fluido-mark.svg, -mark-min.svg and -lockup.svg, and the nav test's list), built and screenshotted at three widths.
evidence  — bench scenario blessed (HARD RULE #19) with before/after in the PR.
verify    — npm run build:check; the gate named in the §8 row for P1.
