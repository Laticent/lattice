---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Present together, with the presenter's narration shared clip by clip

why now   — the owner wants members to share the Present experience with narration, Guide and captions, without each member paying for TTS (note §6.2, §6.3). Supersedes 2547-p3-live-present-with-audience.
where     — present transport on the session clock; narration-store.js clips; a manifest with SHA-256 per clip; Tavola posts for clip requests; Suono gainStream for the mic duck.
done when — Present opens for everyone; only the presenter synthesizes; members fetch clips from any holder and verify the hash; clip-start skew and echo are measured.
evidence  — two-browser recording with the measured skew and an echo check on a real call.
verify    — tier 1 checker: a new binary channel from peers.
