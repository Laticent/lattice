---
origin: 2810
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-live-uniform-experience.md
source: https://github.com/Laticent/lattice/pull/2810
---

# Show what each member is doing, and let Follow mirror it

why now   — members cannot see each other's panels, view or Present, and Follow only tracks the slide (note §5.4). Folds in 2547-p3-live-present-with-audience.
where     — live-model.ts awareness fields + whitelist, the what-you-share switches, StudioShell activeAssistant/view/presentOpen.
done when — avatars show panel, view and presenting; Following mirrors them at 1440/820/390; each can be withheld.
evidence  — two-browser screenshots at three widths.
verify    — tier 1 checker.
