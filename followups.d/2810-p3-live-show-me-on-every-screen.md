---
origin: 2810
priority: P3
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Play Show me on every member's screen at once

why now   — the owner wants someone to teach Lattice with little effort: press the tour, everyone sees it at once (note §5.7, §7.5).
where     — a room event with a shipped tour id and a start time; a session-mode tour binding in use-studio-demo.ts that opens a local practice deck instead of createFirstDeck and leaves the look, the deck menu, Share and the Architect alone.
done when — a tour started by one member plays on every screen at once and the shared deck is byte-identical afterward.
evidence  — a two-browser recording.
verify    — tier 1 checker.
