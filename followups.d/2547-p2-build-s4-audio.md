---
origin: 2547
priority: P2
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Build S4: audio calls on the session's connection

why now   — calls are half of the owner's ask (chat, video or audio); mic controls are hidden until this lands.
where     — Tavola Transport media (addTrack/onTrack), live-controller.ts, LivePanel call section; note §5.8.
done when — join call, mute, speaking ring and device picker work between two browsers with fake media devices, and the mic controls show only when calls exist.
evidence  — a tools/live-session-check.mjs run with Chromium fake-media flags; screenshots at 1440/820/390.
verify    — tier 1 checker, because it adds media to the trust boundary.
