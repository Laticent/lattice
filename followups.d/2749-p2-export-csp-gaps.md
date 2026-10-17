---
origin: 2749
priority: P2
recorded: 2026-10-17
source: https://github.com/Laticent/lattice/pull/2749
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §3
---

# Close or accept the open exits in the exported HTML's policy.

why now   — a red-team review of #2749, reproduced on real exports, found that the plain `.html`
            export's policy has no `default-src`, `script-src` or `frame-src`, so a script in the
            page can reach a server through `<script src>`, `<iframe>`, CSS `@import`,
            `<link>` and meta refresh (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `EventSource`, CSS `url()`, form posts and images are blocked); and that the
            `--player` export lets WebRTC carry page text to a UDP listener. Both leave
            navigation and `window.open` open. Nothing exploits this today without a script
            already running in the page, so it is defense in depth, not a live hole: severity
            medium.
where     — lib/core/subresource-csp.mjs:169-176 (plain export policy, applied at lattice.js:5072),
            lib/export/player-core.mjs:3346 (--player policy). WebRTC is not covered by
            `default-src`; the offline launch arguments in lib/core/offline-chromium.js hide it.
done when — the owner decides, per policy, to tighten it or accept it in writing. A change alters
            the bytes of an exported artifact, so it needs the owner's inspection of a dark and a
            light demo deck first (CLAUDE.md QUALITY BAR); do not change it unasked.
evidence  — the probe in the threat-model note §3.1 re-run on a real export with a control that
            reaches the listener, in Chromium, WebKit and Firefox.
verify    — tier 2 adversarial trio, because it changes an exported artifact and a security
            boundary.
