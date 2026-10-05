---
origin: 2419
priority: P4
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2419
---

# authority-chain: a long tier label pushes that row's citation and gloss right of the others.

Found while measuring the capacity follow-up. Pre-existing on `main` at 0c81e9c; the capacity
change does not touch it. In a chain with `Statute`, `Regulation` and `Enforcement` labels, the
`ENFORCEMENT` row's citation and gloss start about 8px (at 800px wide) right of the other rows,
so the text column zig-zags. The rail column looks sized per row instead of shared across the
chain. Reproduce: render a six-tier chain whose fourth label is `Enforcement` (the manifest's
`stressDoc` sample) and compare the left edge of each citation.

done when — every row's citation starts at the same x, whatever the longest label.
