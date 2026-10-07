---
origin: 2579
priority: P3
recorded: 2026-10-07
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md §12.2
source: https://github.com/Laticent/lattice/pull/2579
---

# Turn a quiet call up: per-person playback volume

why now   — the owner found the call too quiet on an iPhone. iOS plays call audio at call volume once the microphone is on (WebKit bugs 230902, 311451), and an <audio> element cannot go above 1.0.
where     — docs/src/components/studio/live/live-audio.ts (players), docs/src/lib/suono (a gain stage on the owned context, since Web Audio must go through Suono), LivePanel.tsx person ⋯ menu.
done when — each person's ⋯ has a volume slider up to 200 %, remembered per person for the session.
evidence  — a level measurement before and after on the real-WebRTC probe; the owner on the iPhone.
verify    — tier 0 self-review with the gates.
