---
origin: 3037
priority: P2
recorded: 2026-11-05
area: website
severity: medium
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
---

# Fuoco event channel, slice 2: the frame bridge, render and figure events

deferred: blocked — needs slice 1, and the owner's export sign-off (a runtime change alters exported bytes).
where     — lib/runtime/index.js (a host-installed `__latticeEvents`, like `__latticeDrawHost`); docs/src/components/studio/export/deck-export.js.
what      — §5 slice 2: `render.*`, `figure.*`, `fonts.settled`, `fit.*`. Replace `waitForDiagrams` / `waitForMeasuring` polling with awaits; give the 2026-10-23 design-A ledger its data.
done when — both polls are gone, the export's wait is measured before/after, and a demo deck is signed off dark and light.
