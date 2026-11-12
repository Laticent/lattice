---
origin: 3131
priority: P2
recorded: 2026-11-12
area: engine
severity: low
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: blocked — page breaks belong to #2988's measured split (`fit: pack`), which is not on main yet and mishandles these two charts today
source: https://github.com/Laticent/lattice/pull/3131
---

# A kanban, roadmap or journey on a phone page splits one lane, card or stage per page, leaving most of each page empty

why now   — the owner, on the mobile renders (2026-11-10): "kanban being split like that seems odd". PR #3131 makes both
            charts responsive (on a narrow slide the lanes and phase cards stack full width at their natural height),
            and the owner ruled (2026-11-12) that packing them onto pages is #2988's job, not a second engine in #3131.
            So a board that would fit one phone page still splits one lane a page, as on main.
where     — #2988's measured split (`lib/core/fit-measure.js` on `claude/fit-everywhere-tier1`) and the strategies it
            packs (`kanban-lanes`, `roadmap-horizons` in lib/core/carousel.js).
evidence  — a bake-off on 2026-11-12 (#3131): four decks (kanban.gallery, kanban-chart-redesign, roadmap.gallery,
            roadmap-label-sets) at mobile, story, 4:5 and square, #2988 at 8363aa1 with #3131's kanban and roadmap CSS
            and `fit: pack` on. Two defects on #2988's side:
            1. kanban at square, story and 4:5 still packs one lane a page where the stacked board fits: the kanban
               gallery is 30 pages at square (an estimate packing whole lanes made 15), kanban-chart-redesign 22 at
               story (estimate 14). The measured plan reported 0 slides back on today's split, so the plan, not the
               fallback, chose one lane a page.
            2. roadmap's TABLE form overflows the frame at square: 8 pages in roadmap.gallery, 4 in roadmap-label-sets
               (main: 0). Not isolated from #3131's CSS, which the arm carried; the table rules #3131 touches are the
               legend's spacing only.
done when — with `fit: pack`, a kanban or roadmap whose stacked lanes or cards fit a phone page stays one page, one
            that does not packs whole lanes or cards a page, and the four decks above render with no overflow at the
            four phone sizes.
