---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# A chart's per-item description is read as a detached list at the end of the slide

why now   — owner, playing #2393's Guide test deck with hover descriptions added. Measured in the
            built Studio (2026-09-26): the stacked bar reads all three years, then "Services priced
            per seat. Services moved to fixed-fee. First year with a partner channel." with nothing
            saying which year each belongs to; the dumbbell does the same ("Hired two senior
            engineers early. Lost a quarter to the processor migration. …"). Ending the slide on a
            floating sentence is also what made the next-slide flip feel abrupt. The heatmap
            already does it right: "Jan 2026 at M1, sixty-two: dipped after the onboarding change."
where     — lib/core/chart-narration.js, per chart (stacked-bar, slope/dumbbell, and every chart
            that takes a `detail` sublist: bar, line, piechart, scatter, gantt, funnel, map,
            quadrant, radar — check each).
done when — each description is read right after its own item ("FY26: Licenses, twenty-four;
            Services, eighteen. First year with a partner channel."), and the Guide focuses that
            item while it is read.
evidence  — narration text before and after for each chart in the Guide test deck.
verify    — play the deck in the Studio; each description lands while its bar, row or task is
            focused.
