---
origin: 2997
priority: P2
recorded: 2026-11-02
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-02-slide-facts-for-kinds.md §6, §7.5, §7.6
deferred: blocked — after the pilot's go (followups.d/2997-p1-chart-pilot-three-kinds.md)
source: https://github.com/Laticent/lattice/pull/2997
---

# Convert the other 25 kinds by shared reader, then move the grammars and retire the old contract

why now   — the sanctioned imports (tools/structure.sanctioned.json) reach zero only when every kind reads the tree and the grammars live in the plugin
where     — one PR per shared reader (cartesian, mark-detail, callout lift, table reader, label-set lift); then the chart
            grammars and models into the plugin with its lint role and a narrator service; the inbound edges (CLI label
            drops, layout engines, SVG export, runtime layouts, Playground callout placer, basemaps) to plugin roles,
            not to `hostApi` (moving them there would only raise HOST_API_CEILING); the transformSection contract deleted
done when — tools/structure.sanctioned.json is empty and deleted with both sanction lists in tools/structure.js; no kind
            exports transformSection
evidence  — `npm run identity:check -- --strict` per PR (0 differ); the shrinking list
verify    — npm test; node tools/check-structure.js
