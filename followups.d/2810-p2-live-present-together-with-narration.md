---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Present together, with the presenter's narration over the call and direct clips

why now   — the owner wants members to share Present with narration, Guide and captions (note §5.5, §5.6, §7.2, §7.3). Supersedes 2547-p3-live-present-with-audience. Needs 2704-p2-present-follows-the-hub first.
where     — the present transport on the session clock; PresentOverlay.tsx keyboard guard; narration mixed into the presenter's Suono send; compressed clips on a separate Trystero action; the frozen narrated text and per-run budget.
done when — the host starts it; idle members join and a typist gets a toast; keys stay inert until clicked; iPhones show Tap to listen; members on the call hear the mix; members off it get clips; no member calls TTS.
evidence  — a two-browser recording at phone and desktop width; the call mix measured on a real call.
verify    — the adversarial trio (a new binary channel and spend on the presenter's key).
