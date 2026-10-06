---
origin: 2547
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Live keys "Reconnecting…", "mine" and chat repeats by display name, which two people can share

why now   — the away grace (`away`), the "mine" guess for lines restored after a reload, and the host's drop-a-repeat check all key on the member's name (live-controller.ts). Two people named "Sam" can hide each other's "Reconnecting…" row, share one "left" note, see each other's restored lines on the right, or (only with a copied line id) have a resend taken as a repeat. Found by the inversion review, round 3; likelihood low in a four-person room.
where     — docs/src/components/studio/live/live-controller.ts; Tavola would need to expose a stable member identity (the rejoin token's hash) to the app.
done when — those three key on a stable per-member identity, not the name, and a test with two members of the same name passes.
evidence  — a controller test with two "Sam"s across a blip and a reload.
verify    — tier 1 checker.
