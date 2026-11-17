---
origin: 3299
priority: P3
recorded: 2026-11-17
area: infra
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — never reproduced; 5 runs green on main, alone, under a CPU hog and inside the full integration tier
---

# The Firefox plain-export witness missed webrtc once, during a full integration run

why now   — `test/integration/export-nightly/npm-plugin-export-check.test.js` failed once on 2026-11-15
            (~15:00Z, a branch at b74b5d34c, a full integration run: 1914 pass, 4 fail).
            `not ok 11 - firefox · plain export · the harness works` (90.6 s) and `not ok 12 … only the accepted
            exits are open` both threw "the witness never heard webrtc, so the walled run's zero proves nothing",
            from `reached` (`heardAll(w)`, whose `until` waits up to 60 s). Test 12 reads the same cell, so it is the
            same failure, not a second one. The firefox player export passed in the same run and listed webrtc
            among its open exits. Not a fixed-duration wait: the witness waits on the listener hearing each vector.
where     — `reached()` and the `webrtc` vector in `vectors()` (an `RTCPeerConnection` to a TURN URL on a loopback
            UDP listener), test/helpers/request-log.js `until`.
done when — the miss is reproduced and fixed at its cause, or this file is deleted after the nightly integration
            tier runs green on firefox plain for two weeks.
evidence  — the reproducing run's TAP output with the `never heard webrtc` line, then the fixed run green.
verify    — tier 1 checker.

## What was tried (2026-11-17, main at d743dfb4f and later, this sandbox)

| run | result |
|---|---|
| the file alone | 12/12 in 98 s |
| the file ×3 under an 8-process CPU hog (4 cores) | 12/12 each, 115–120 s |
| the full integration tier (`test/integration/**`), WebKit and Firefox enabled | 2014 tests, 0 fail; firefox plain 11 and 12 ok |
| a probe: one unreferenced `RTCPeerConnection` in Firefox, then ~400 MB of garbage to force a GC | TURN heard 10/10, same as with a kept reference |
| a probe: two pages, two connections to two ports in one Firefox (the walled run, then the witness) | both heard 10/10 |

So the garbage-collected-connection idea and the two-connections-in-one-browser idea are both ruled out on
this machine. What is left untested is the original box's contention: a full integration run on a branch,
with other suites holding Firefox and UDP sockets at the same time.

Not related to `docs/e2e/net-witness.ts`, the Playwright witness. That one never sends WebRTC on Firefox
(every caller passes `udp: false` there), and its four specs went 175/175 on gecko and 100/100 on desktop at
4 workers ×25.
