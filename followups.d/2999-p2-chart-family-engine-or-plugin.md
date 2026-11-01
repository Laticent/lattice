---
origin: 2999
priority: P2
recorded: 2026-11-01
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-01-plugin-contract-hollywood.md §7
deferred: blocked — an owner decision: either answer changes plugin-system §5, a canonical record
source: https://github.com/Laticent/lattice/pull/2999
---

# Decide whether chart-family is engine code or a plugin

why now   — the P1 contract PR's structure gate must either drop chart-family's by-name exception or keep
            it; the owner's no-tech-debt rule argues against a permanent exception.
where     — lib/plugins/chart-family/shared/chart-registry.generated.js:5-32 (imports 28 chart component
            transforms); engineering/decisions/2026-09-27-plugin-system.md §4.1, §5; tools/structure.js
            `SANCTIONED_PLUGIN_REACH` on #2997's branch.
done when — the owner picks; plugin-system §5 records the pick; the P1 PR either moves chart-family into
            the engine (no exception) or keeps it a plugin with a named, justified sanction.
evidence  — the structure gate's report with no plugin exception (engine pick), or with exactly one named
            sanction (plugin pick); chart gallery decks byte-identical.
verify    — tier 1 checker, because it reclassifies a dispatcher that every chart renders through.
