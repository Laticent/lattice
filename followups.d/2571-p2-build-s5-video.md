---
origin: 2571
priority: P2
recorded: 2026-10-07
source: https://github.com/Laticent/lattice/pull/2571
---

# Build S5: video on the session's connections

why now   — calls are audio only; the owner asked for "chat, video or audio", and the roadmap orders video after audio (§1).
where     — Tavola setMedia already sends any track to admitted members; the Studio needs a camera toggle, tiles and the pop-out strip (design note §5.8, roadmap §1).
done when — camera on/off, tiles for 2–4 people at about 360p, gated by the roster like audio.
evidence  — a fake-media run with video, screenshots at 1440/820/390, and the measured upload per person.
verify    — tier 1 checker (media and the trust boundary).
