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

why now   — phase G (the npm door) must not open until a hostile plugin is shown contained.
            Decided 2026-10-17 (note §6): this test is a hard exit criterion, in the integration
            tier, with no new CI job.
where     — test/integration/export/plugin-fence-door.test.js (precedent), lib/core/code-sandbox.js,
            lib/core/offline-chromium.js; the real-export probe described in the note's §3.1 and §7.
done when — an integration test runs a deliberately hostile plugin through the locked page and reads
            zero packets on a local HTTP, WebSocket and UDP listener, goes red when a wall is
            weakened. It also includes the note's §5.2 export check: each HTML export (--player and
            plain) is opened with NORMAL browser arguments (not lib/core/offline-chromium.js's)
            against a listener on HTTP and UDP with a TURN responder, in Chromium, WebKit and
            Firefox, and navigation, window.open, WebRTC and the subresource exits all read zero.
            Each cell has a control that reaches the listener. Today that cannot pass without an
            export change (follow-up 2749-p2), so it must not pass by accepting an exit.
evidence  — the test output with the weakened-wall run red and the normal run green.
verify    — tier 1 checker: it touches the sandbox walls, which are high blast radius.
