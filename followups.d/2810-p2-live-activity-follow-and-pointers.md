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

why now   — members cannot see each other's panels, view or pointer, and Follow only tracks the slide (note §5.4, §7.6). The per-message sender rules and the receiver allowlist (note §6) land here.
where     — live-model.ts awareness and posts, the what-you-share switches, StudioShell activeAssistant and view, a plain pointer overlay (not Vetrina cues).
done when — avatars show panel, view and presenting; Following mirrors them at 1440/820/390; a forged post from the wrong sender or outside the allowlist does nothing; pointers never scroll the page.
evidence  — two-browser screenshots at three widths; a test that replays forged posts.
verify    — the adversarial trio (receiver-side safety).
