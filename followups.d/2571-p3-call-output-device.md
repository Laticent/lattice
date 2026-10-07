---
origin: 2571
priority: P3
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2571
---

# Pick the speaker (output device) in a call

why now   — the call row picks the microphone only; a laptop with a headset cannot route the call to it from the Studio. Safari does not support setSinkId, so it would be Chromium and Firefox only.
where     — docs/src/components/studio/live/live-audio.ts (HTMLMediaElement.setSinkId on each player), LivePanel.tsx CallRow menu.
done when — the call row's ⋯ lists outputs where setSinkId exists and hides the section where it does not.
evidence  — a fake-media run choosing an output, screenshots at 1440/820/390.
verify    — tier 0 self-review with the gates.
