---
origin: 2630
priority: P2
recorded: 2026-10-11
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-11-codebase-structure.md §8
source: engineering/decisions/2026-10-11-codebase-structure.md §8
---

# Move lib/core's single-consumer files beside their one user

why now   — `npm run structure` reports 34 lib/core files that no core file imports and exactly one
            other part does. Each is part-local code sitting in the shared layer. Same-layer imports
            are free, so core is the gate's easiest way out, and it grows unless the rule holds: a
            file moves down only when two or more parts use it.
where     — the "single-consumer files" list from `node tools/structure.js --json` (`inside["lib/core"]`):
            pdf-timestamps.js, read-along-*.js and split-verdict.js (only lattice.js);
            pdf-compose/compose.mjs (only site/studio); flowchart-row-grammar.js,
            list-text-grammar.js and gesture.js (only tools/); diagram-band.js and
            slide-class-spans.js (only the plugin kit); and the rest of the list.
done when — each is moved beside its user or kept with a stated reason, and lib/core's
            single-consumer count is recorded in test/quality/structure.json.
