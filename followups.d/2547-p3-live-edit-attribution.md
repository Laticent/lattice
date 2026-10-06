---
origin: 2547
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Show who changed what in version history

why now   — with several people editing, "who changed this slide?" has no answer. Yjs already knows which client wrote each item, so attribution is cheap (roadmap §6).
where     — docs/src/components/studio/ (version history), live-controller.ts (client id to name, as the roster binds them).
done when — version history shows each change with the name of the person who made it, for changes made in a live session.
evidence  — a controller test plus a screenshot of the history panel.
verify    — tier 1 checker.
