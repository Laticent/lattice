---
origin: 3313
priority: P9
recorded: 2026-11-19
area: engine
severity: low
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §3 Phase 6
deferred: blocked — a plugin-contract change waiting on the owner (D6)
source: https://github.com/Laticent/lattice/pull/3313
---

# Plugin styles load when the plugin is used, on surfaces that load on demand

why now   — plugins own their stylesheets but every one is bundled into lattice.css whatever a deck uses, while their other assets (Mermaid's library, icon and plugin data) already load when used.
where     — lib/plugins/plugin.schema.json (styles: { when }), tools/build-plugin-registry.js, tools/css-modules.js, docs/src/lib/style-loader.ts, tools/style-needs-common.json. The full lattice.css and Export-to-Marp keep every plugin.
done when — the style-loader gate shows 0 differing elements on every deck on Chromium and WebKit, and a no-plugin deck's start-up bytes are measured before and after.
evidence  — gate summaries and the byte table.
verify    — tier 2 trio, because it changes the plugin contract.
