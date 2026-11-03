---
origin: 3021
priority: P3
recorded: 2026-11-03
area: inventory
severity: low
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: off-path — glossary owns its table (deny list); #3021 does not touch it
source: https://github.com/Laticent/lattice/pull/3021
---

# glossary declares its table as key-value and takes the pairs layout when narrow

why now   — glossary renders a term/definition table, exactly the key-value kind #3021 lays out as pairs, but it is on the universal treatment's deny list, so the reflow does not reach it.
where     — lib/components/inventory/glossary/ (manifest + styles); lib/base/base.table-reflow.css's deny list.
done when — a glossary in a narrow pane shows each term above its definition, the slide fit check applies, and a full-width glossary is unchanged.
evidence  — the Frame Lab glossary entry at 360px.
verify    — npm run lab:build -- --only glossary; the glossary gallery against main.
