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

why now   — two members can render different slides today: an un-themed deck follows each viewer's palette and mode, and the host's saved themes and finishes never reach a guest (note §3).
where     — 1a: the frozen look (note §5.1), live-controller.ts and StudioShell.tsx preview resolution. 1b: Library records through refuseImportedTheme then sanitizeStyleText, the rule-6 baseline in the host save, maxReceiveBytes (note §5.2, §6).
done when — reproduced first; two real browsers with different palettes, modes and Libraries render pixel-equal previews through a host drop and a takeover; a guest who types a new private name gets nothing until the host agrees; code components fall back with a label.
evidence  — two-browser screenshots before and after.
verify    — 1a tier 1 checker; 1b the adversarial trio (a new peer CSS path).
