---
origin: 2571
priority: P1
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2571
---

# Verify the regency and calls on two real devices

why now   — the first host's return (reload or frozen phone tab) and audio ran only on the in-memory network or with Chromium's fake microphone; real WebRTC renegotiation, echo between two devices and iOS Safari are unverified.
where     — the PR preview link; design note §8.1 (runbook), §12.1 and §12.2; tools/live-session-check.mjs.
done when — on two real devices: the host's phone locks for a minute, the other editor hosts, the phone wakes and takes the session back with chat intact; and a two-person call with mute and the speaking ring works, including on an iPhone.
evidence  — screenshots from both devices of each step, recorded in §12.1 / §12.2.
verify    — tier 0; the owner runs it (pairs with 2547-p1-verify-live-on-two-real-networks).
