---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Present together: narration on a real iPhone and acoustic echo

why now   — Slice 3 step 3 built the clips for members off the call and "Tap to listen" (note §7.3, "Slice 3, step 3 as built"). Two real browsers in three engines measured sound at the audio output; an iPhone-profile WebKit guest with a touch tap and a page-side stand-in for iOS's gesture rule passed (and fails when unlock is delayed); two real Chromium browsers both on the call measured the narration arriving through the call, once, with no clips. Two things only a device or a person can answer are still open.
where     — (1) Safari on a real iPhone: whether the "Tap to listen" tap starts sound (the stand-in follows the rule as stage.ts documents it, not iOS), and whether a Present opened by a room event on a phone behaves. (2) Acoustic echo: whether an UNMUTED presenter's own speakers feed back into their microphone so call members hear the narration twice; headless browsers have no speakers or room.
done when — each has a recorded result: a number or a recording from the real surface, or a written decision to change the design.
evidence  — an iPhone with Safari in a live session; two people on a real call with the presenter's microphone on.
verify    — tier 0 gates; the result is a measurement, not a code change, unless it finds a defect.
