---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Show what each member is doing and where their pointer is, and let Follow mirror it

why now   — members cannot see each other's panels, view or Present, and Follow only tracks the slide (note §5.4). Pointers and actions are drawn by Vetrina and can never click (note §6.5); the receiver allowlist (§6.1) lands here.
where     — live-model.ts awareness fields + whitelist, the what-you-share switches, StudioShell activeAssistant/view/presentOpen.
done when — avatars show panel, view and presenting; Following mirrors them at 1440/820/390; pointers land on the same element at three widths; each can be withheld; a forged post outside the allowlist does nothing.
evidence  — two-browser screenshots at three widths.
verify    — tier 1 checker.
