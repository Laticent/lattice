---
origin: 2997
priority: P1
recorded: 2026-11-02
area: engine
severity: high
swimlane: engineering/decisions/2026-11-02-slide-facts-for-kinds.md §2, §3, §4, §7.3
deferred: large — its own PR by the owner's split decision (2026-11-02)
source: https://github.com/Laticent/lattice/pull/2997
---

# Build the chart tree in the host frame, and give kinds one manifest-built ctx

why now   — the pilot and every conversion read the tree; nothing else in the kind rewrite can start before it
where     — lib/transformers/chart-frame.js (the adapter: section HTML to our tree, opaque branded html, records as runs);
            lib/core/plugin-ctx.js (one builder, members gated by the manifest); the host calls `read`/`draw` when a kind
            exports them and `transformSection` otherwise, with a gate counting old-contract kinds that can only fall.
            Also: chart-frame.js names the plugin (`DISPATCH['chart-family']`, read at module load, so a renamed or
            missing plugin throws on require instead of failing soft) and re-exports `KERNELS`; select the frame's
            plugin by its manifest role, and stop re-exporting the plugin's table (inversion on #2997, item 8)
done when — the tree typedef (version 0) is in the plugin contract; one ctx builder serves every plugin; chart-name
            lists in lib/core are generated from manifests; the frame is selected by a manifest role
evidence  — `npm run identity:check -- --strict` (0 differ, 0 unpaired); a fixture builder for literal trees; the old-contract count
verify    — npm test; npm run equiv:check; the applyToDom and two-pane fixtures
