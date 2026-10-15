---
origin: 2694
priority: P1
recorded: 2026-10-14
area: engine
severity: low
swimlane: engineering/decisions/2026-10-14-engine-spine.md §3
source: https://github.com/Laticent/lattice/pull/2694
---

# Build the lint core as an entry of the ESM engine build, after a shared-state audit

why now   — the lint core (authoring-core, 176KB gz) still carries about 56-80KB gz of modules
            the ESM engine already ships; both run in the page window, so the page parses them
            twice. It now loads after first paint, so this is post-paint parse, not startup.
where     — tools/build-playground.js (ESM_OPTIONS entries), tools/build-authoring-core.js,
            docs/src/playground/authoring-door.js.
done when — the lint core is an entry of the ESM build; every module-level mutable singleton
            that lands in a shared chunk (lib/core/boundary-parser.mjs rulesGeneration and its
            setBoundaryPluginsOff; plugin-data.js's failed set; the inline-pills.js and
            front-matter-key.js memos) is listed in the decision note with a decision, and a
            test pins that a lint-side setBoundaryPluginsOff does not change the engine's own
            section splits.
evidence  — inversion measured a 2-entry ESM split at 63KB gz of lint beyond the engine (56%
            saving) and 87KB with the charts split out (39%); the red team showed
            boundary-parser.mjs lands in a chunk both entries import.
verify    — the 276-deck byte-identical A/B in the PR body, with the Studio editor's plugin
            admission narrowed.
