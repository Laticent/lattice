---
origin: 2810
priority: P5
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2810
---

# The "wants to join" toast stays up after the host admits from the panel

why now   — seen in the 2026-10-20 two-browser reproduction: about 4 s after the host admitted Amina (the roster read 2/4), the toast "Amina wants to join · Admit · Deny from the Live panel" was still on the host's screen, offering to admit someone already in.
where     — the knock toast in docs/src/components/studio/live/ (design note §4.3); it should dismiss when the knock resolves by any path.
done when — admitting or denying from the panel, the toast, or auto-admit dismisses the toast at once.
evidence  — a two-browser screenshot after admission showing no toast.
verify    — tier 0, plus the two-browser run.
