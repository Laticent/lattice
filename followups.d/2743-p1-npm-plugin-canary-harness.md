---
origin: 2743
priority: P1
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2743
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# Build the npm-plugin canary harness on top of plugin-fence-door.test.js.

why now   — phase G (the npm door) must not open until a hostile plugin is shown contained; the
            note's decision 5 makes this an exit criterion.
where     — test/integration/export/plugin-fence-door.test.js (precedent), lib/core/code-sandbox.js,
            lib/core/offline-chromium.js; the real-export probe described in the note's §3.1 and §7.
done when — an integration test runs a deliberately hostile plugin through the locked page and reads
            zero packets on a local HTTP, WebSocket and UDP listener, goes red when a wall is
            weakened, and includes a real-export check that covers navigation and window.open.
evidence  — the test output with the weakened-wall run red and the normal run green.
verify    — tier 1 checker: it touches the sandbox walls, which are high blast radius.
