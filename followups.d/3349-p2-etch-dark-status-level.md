---
origin: 3349
priority: P2
recorded: 2026-11-20
area: chart
severity: medium
swimlane: engineering/chart-styling.md §3
deferred: blocked — raising it collides with the owner's one-status-level rule (#2908), and text sits on the same level
source: https://github.com/Laticent/lattice/pull/3349 — WP-marks (F6), engineering/decisions/2026-11-20-deck-preset-study.md §8
---

# Etch's dark status bars and Plan / Actual columns still sit under 3:1

WP-marks raised etch's dark CATEGORY body to 3:1 against the slide (the category ink at 78%). The status
level was left alone: under etch a status mark (a progress bar, a gantt bar, a waterfall's up and down bars)
and the waterfall's Plan / Actual columns take the status level, 14% light and 19% dark, which on a dark
slide measures 1.04 to 1.60:1 against it (the status solids at 19% toward the canvas, every built-in palette; read from the palettes, not a render). The outline (etch's doubled edge) is what reads.

It is not a one-line change. #2908 settled ONE status level per finish, shared by marks that carry text
(a gantt bar's label sits on it, in the heading ink) and marks that do not. Raising the shared level to 3:1
on dark takes the heading-ink text on a gantt bar under 4.5:1; splitting the level per mark is what #2908
ruled out. The owner picks: keep one level and accept the outline as the mark on dark, or allow a stronger
level for text-free status marks on a dark slide only.

done when — the owner has picked one of the two, and either a text-free etch status mark on a dark slide
clears 3:1 against it in `test/unit/components/marks-finish-contrast.test.js`, or this section of
`engineering/chart-styling.md` §3 records that the outline is the mark there, by decision.
