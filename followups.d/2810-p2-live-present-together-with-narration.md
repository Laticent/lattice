---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Present together: send narration clips to members off the call, and caption members in step

why now   — Present together and narration on the call shipped in #2810 (note §7.2, §7.3 steps 1 and 2). Still owed from the owner's decision §5.6: members off the call hear nothing, and a member's captions do not run in step with the presenter. Supersedes 2547-p3-live-present-with-audience.
where     — compressed clips (lib/core/narration-encode.mjs) on a separate Trystero action with backpressure, addressed by content hash from the current run only; a caption transport (sentence index on the session clock) driving the member's PresentCaption; echo check on a real call.
done when — a member off the call hears the narration from clips; a member's captions follow the presenter's sentence; iPhones show Tap to listen; no member calls TTS; whether the presenter's unmuted mic doubles the narration is measured.
evidence  — a two-browser recording at phone and desktop width; the call mix measured on a real call.
verify    — the adversarial trio (a new binary channel and spend on the presenter's key).
