---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Present together: narration on a real device and a real call

why now   — Slice 3 step 3 built the clips for members off the call and "Tap to listen" (note §7.3, "Slice 3, step 3 as built"), and ran them on two real browsers in three engines. Three things only a device or a person on a real call can answer are still open.
where     — `tools/live-narration-check.mjs` covers the transport and the decode; it cannot hear. Still unmeasured: (1) whether browser echo cancellation removes the presenter's local narration from their microphone, so an unmuted presenter's call members hear it once, not twice; (2) whether the call mix sounds right on a real call; (3) whether the "Tap to listen" tap starts sound on a real iPhone, and whether a Present opened by a room event on a phone behaves.
done when — each of the three has a recorded result: a number or a recording from the real surface, or a written decision to change the design.
evidence  — two people on a real call, with the presenter's microphone on and off; an iPhone with Safari.
verify    — tier 0 gates; the result is a measurement, not a code change, unless it finds a defect.
