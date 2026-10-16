---
origin: 2512
priority: P4
recorded: 2026-10-05
area: chart
severity: low
swimlane: engineering/decisions/2026-10-05-trama-radial-layout.md
source: engineering/decisions/2026-10-05-trama-radial-layout.md
---

# Trama draws its filled arrowhead twice

why now   — the pipeline's `head()` (`docs/src/lib/trama/pipeline.ts`) and the radial kernel's `arrowheadPath` (`radial.ts`) draw the same filled triangle: tip, then the `+perp` base corner, then the `-perp` one, in that order in both. They differ only in how they print a point: `head()` rounds to one decimal and writes `x y`; `arrowheadPath` writes two decimals as `x,y`. The proportions differ on purpose (a line head is as wide as it is long; a band head is 0.9 of the band wide and 1.25 of it long, never under 8 units), and those stay arguments.
blocker   — checked 2026-10-05: the two functions cannot share code by an import. `installGraphPass` closes over nothing because `flowchart.layout.js` and `state-chart.layout.js` ship it as `toString()` source in the export bootstrap `<script>`, and the radial kernel runs in Node inside `hub-spoke.transform.js`. A shared arrowhead has to reach the pipeline as one more argument whose source rides in that bootstrap. So the merge changes the exported HTML of every deck with a flowchart or state chart, and that is an export change the owner signs off on (CLAUDE.md, QUALITY BAR). The cost is that sign-off plus a re-blessed golden for both charts. The gain is one 6-line function.
where     — `docs/src/lib/trama/pipeline.ts` `head()`, `docs/src/lib/trama/radial.ts` `arrowheadPath`, the bootstrap strings in `lib/components/chart/{flowchart,state-chart}/*.layout.js`.
done when — one arrowhead serves both, landed in a change that already re-blesses flowchart and state-chart output AND already changes their export bootstrap, so the sign-off covers both at once.
evidence  — the flowchart and state-chart golden diffs, with the change explained as rounding only.
verify    — tier 1: maker-checker.
