---
origin: 2547
priority: P1
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2547
---

# Verify a live session on two real devices and two networks

why now   — every real-browser run so far had both browsers on one machine, so NAT traversal, join time across networks and iOS Safari are unverified, and they decide whether the feature works for real users.
where     — the owner's two devices; tools/live-session-check.mjs shows the steps; note §8 and §12.
done when — one link opened on two devices on two different networks (home + phone on cellular, ideally an office) reaches live editing, and §12 records the result.
evidence  — a short screen recording or screenshots from both devices.
verify    — tier 0 for the record; the owner runs it.
