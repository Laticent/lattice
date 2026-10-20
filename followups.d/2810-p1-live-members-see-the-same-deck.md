---
origin: 2810
priority: P1
recorded: 2026-10-20
area: website
severity: medium
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Make every Live member see the same deck

why now   — two members can render different slides today: an un-themed deck follows each viewer's palette and mode, and the host's saved themes, finishes and components never reach a guest (note §3).
where     — docs/src/components/studio/live/ (publish resolved look + package records), StudioShell.tsx preview resolution, sanitizeStyleText for peer CSS.
done when — reproduce first; then two browsers with different palettes, modes and Libraries render pixel-equal previews of a deck using a saved theme, finish and component; code components wait behind Trust and render.
evidence  — two-browser screenshots before and after.
verify    — tier 1 checker: a new untrusted-CSS sink and a code-trust prompt.
