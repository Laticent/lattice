---
origin: 2743
priority: P2
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2743
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.1
---

# Propose the G1 purity check for plugin and component code, and measure what it costs.

why now   — the principle that plugins never touch the network, storage or AI holds today only by
            habit; no check in tools/check-ownership.js enforces it.
where     — tools/check-ownership.js (a new check beside checkPreviewHtmlSinks); the allowlist must
            name the five first-party loads listed in the note's §4. Decided 2026-10-17 (note §6):
            measure first. Time the added cost of build:check, show the owner, and add the check
            only if the cost is small.
done when — a plugin or component file that adds fetch, XMLHttpRequest, WebSocket, sendBeacon, a
            storage call or the key name fails build:check, and a stale allowlist entry fails too.
evidence  — build:check run red on a deliberate violation, green on main, with before/after seconds.
verify    — tier 0 gates, because it changes what a gate finds and adds no CI step.
