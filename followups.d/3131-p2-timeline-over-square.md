---
origin: 3131
priority: P2
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-11-10-chart-form.md
deferred: blocked — the owner's pick between scaling the timeline and splitting it (❓ card D2 on #3131)
source: https://github.com/Laticent/lattice/pull/3131#issuecomment-6817033887
---

# A timeline of four long entries cannot fit a square page at 11pt

why now   — gallery-jargon.md's "How the framework reached production" at square: four entries with two-line titles and
            bodies need 806px of a 657px page in the stacked form, and in the four-across form the last entry ran off the
            page. No layout holds it at 11pt.
where     — kinds/timeline-list (no split strategy, not on the kernel).
done when — the owner's pick is built (recommended: drawn whole and scaled, the over-capacity rule), and the slide shows
            every entry on a square page.
