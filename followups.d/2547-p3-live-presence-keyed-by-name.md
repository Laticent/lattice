---
origin: 2547
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Live keys "mine" and chat repeats by name and color, which a later joiner can inherit

why now   — the "mine" guess for lines restored after a reload and the host's drop-a-repeat check key on the member's name (and color, for repeats) rather than a stable identity (live-controller.ts). A later joiner who gets the same name and the freed color can see the earlier person's restored lines on the right as theirs. The away grace now keys on name + color (fixed in this PR). Found by the round-3 inversion and checker; likelihood low in a four-person room.
where     — docs/src/components/studio/live/live-controller.ts; Tavola would need to expose a stable member identity (the rejoin token's hash) to the app.
done when — those three key on a stable per-member identity, not the name, and a test with two members of the same name passes.
evidence  — a controller test with two "Sam"s across a blip and a reload.
verify    — tier 1 checker.
