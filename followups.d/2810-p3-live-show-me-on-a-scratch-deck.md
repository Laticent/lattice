---
origin: 2810
priority: P3
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Run Show me for everyone on a scratch deck

why now   — the owner wants someone to teach Lattice with little effort; a tour must not touch the real deck (note §6.4).
where     — use-studio-demo.ts, tours/, a Y.Text('scratch') in the session document, Vetrina theater replay.
done when — a tour started by one member plays on every screen and the real deck is byte-identical afterward.
evidence  — two-browser recording.
verify    — tier 1 checker.
