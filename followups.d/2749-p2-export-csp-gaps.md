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

Re-run 2026-10-18 on real exports in Chromium 131, WebKit 26.0 and Firefox 142.0.1 with a control per cell
(`test/integration/export-nightly/npm-plugin-export-check.test.js`, the threat-model note's "Measured 2026-10-18" paragraph):
`--player` leaves `navigate`, `windowopen`, `webrtc`, `metarefresh` and a `target=_blank` link open in all three engines; the plain
export also leaves `scriptsrc`, `iframe`, `cssimport`, `linkstyle` and (Chromium) `prefetch` open. Nothing was changed: the exits are
export-byte changes and wait for the owner's inspection and decision per policy. That test loses its `todo` when the last gap closes.

Timing (the owner asked on 2026-10-18 when this should be closed). Recommendation: **before the npm door opens, in its own PR straight
after the harness PR merges, and not earlier than the owner's inspection of the renders.** Why: the export check is an exit criterion for
phase G (note §6 decisions 2 and 5), so the door cannot open while any cell reads an open exit, and v1 sends no plugin code to an
export (decision 10), so nothing exploits these today and there is no reason to rush ahead of review. Order inside that PR: (1) the
`--player` policy (it already has `default-src 'none'`; only navigation, `window.open`, WebRTC and meta refresh remain), (2) the plain
export, which has no `default-src`, `script-src` or `frame-src`. Each step needs a dark and a light render of one demo deck sent to the
owner before it merges; the nightly export check (`test/integration/export-nightly/`) loses its `todo` (the "no exit is open" tests; the "harness works" tests are already hard failures) in the commit that closes the last
cell. If the owner would rather accept an exit than close it, that is a written decision in the note, and the check then names it.

