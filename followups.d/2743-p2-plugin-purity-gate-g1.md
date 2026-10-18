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

Measured 2026-10-18 (prototype scan of `lib/plugins`, `lib/components`, `lib/runtime`; vendored, minified, generated and test files
excluded; 105 files, 2,022 KB; the names `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `localStorage`,
`sessionStorage`, `indexedDB`, `openrouter`, `OPEN_ROUTER_KEY`; best of two runs; this container):

| Scan | Time | Hits |
|---|---|---|
| Regex over comment-stripped text | 33 ms | 1 (`lib/runtime/index.js` `fetch`, the deck's own markdown, already in the note's §4) |
| acorn parse and identifier walk | 436 ms | the same 1 |

`npm run build:check` takes 34.8 s here, so the parsed scan adds about 1.3% and the regex scan 0.1%. **Recommendation: add the parsed
scan** (a regex also flags a name in a string, and the parse is still under half a second), with the `lib/runtime/index.js` fetch as the
first allowlist entry and the other four first-party loads from §4 added as the scan finds them. It is NOT added here: a new
`build:check` gate changes the CI contract, which CLAUDE.md's second filter reserves for the owner. The scratch script that produced the
table is not in the repo; the first step of the change is to recreate it as the check.

