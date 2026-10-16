---
origin: 2633
priority: P2
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2633
---

# Measure the slow first connect, and what a phone host's lock does to the 20 s handoff grace

why now   — The owner reported a slow or stuck first connect on a phone and tablet; the connection log now records every attempt, but no slow one has been captured, and a host phone that backgrounds hands the session to the heir after 20 s.
where     — Connection log in live-controller.ts (copyLog); HANDOFF_GRACE_MS in docs/src/lib/tavola/session.ts; the diagnostics paragraph in §12.3 of the live-collaboration note.
done when — A captured log of a slow first connect from both devices, read for where the time went (relay discovery, ICE gather, STUN errors), and one decision: leave it, or change the 20 s grace for a mobile host.
evidence  — two connection logs from one slow attempt; the numbers in §12.3.
verify    — tier 3; needs the owner's two devices on a network that reproduces it.
