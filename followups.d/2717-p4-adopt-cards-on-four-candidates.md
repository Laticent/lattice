---
origin: 2717
priority: P4
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §13.9
---

# authority-chain, checklist, cycle and premise look like card rows and declare no `cards`

why now   — §13.9: the four are scored as candidates in test/conformance/card-row-corpus.json because adopting `cards` changes how each sits on the stage by default, and that is a composition ruling, not a harness change
where     — lib/components/{legal/authority-chain,inventory/checklist,progression/cycle,statement/premise}; each manifest's `cards` and one `--cards-align` declaration per stylesheet, as stats, actors and kpi did (§13.6)
done when — the owner rules per component (adopt with a default, or relabel false with a reason); each adopted one moves from `candidates` to `labels: true` in the same change, with a demo deck
evidence  — today-versus-adopted renders per component, as §13.6 did
verify    — tier 1, because the default look changes
