---
origin: 2997
priority: P1
recorded: 2026-11-02
area: chart
severity: high
swimlane: engineering/decisions/2026-11-02-slide-facts-for-kinds.md §7.4
deferred: blocked — needs the id prefix and the tree (followups.d/2997-p1-id-prefix-per-figure.md, -chart-tree-and-one-ctx.md)
source: https://github.com/Laticent/lattice/pull/2997
---

# Pilot: bar, heatmap and journey on the tree

why now   — proves the contract on three different kinds before 25 more move
where     — lib/plugins/chart-family/kinds/{bar,heatmap,journey}; the shared readers they use convert with them
done when — go or no-go recorded against the criteria written before it starts: byte-identical on the corpus and every
            path; no HTML parsing and no lib/ import in the three; no chart name added to the engine. A no-go reverts the three
evidence  — `npm run identity:check -- --strict` (0 differ, 0 unpaired); committed JSON snapshots of each kind's read(tree) model
verify    — npm test; npm run equiv:check; the applyToDom and two-pane fixtures
