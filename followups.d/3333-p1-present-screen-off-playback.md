---
origin: 3333
priority: P1
recorded: 2026-11-20
area: website
severity: high
swimlane: engineering/decisions/2026-11-20-present-keeps-playing.md
source: https://github.com/Laticent/lattice/pull/3333
deferred: large — reworks the narration audio path in read-aloud.ts and needs a real iPhone to verify; waiting on the owner's D2
---

# Present keeps narrating with the phone's screen off

```text
  P1 · Narration and continuous play survive a locked iPhone screen
       why now   — #3333 keeps the screen on (wake lock), so a plugged-in phone plays to the end.
                   The owner asked for better: play with the screen off. iOS suspends a page's
                   Web Audio context and its timers when the phone locks.
       where     — docs/src/components/studio/read-aloud.ts (the Suono stage's output),
                   docs/src/lib/suono/stage.ts, PresentOverlay.tsx (beats run on setTimeout)
       done when — the stage's output goes through a MediaStreamAudioDestinationNode into an
                   <audio> element iOS treats as media; slide advance is driven by the audio's
                   own end, not setTimeout; locking the phone mid-deck keeps it playing to the end.
       evidence  — a screen recording or the owner's report from a real iPhone (no harness here
                   can lock a phone); unit tests for the advance-on-ended path
```
