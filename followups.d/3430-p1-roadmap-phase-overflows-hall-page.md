---
origin: 3430
priority: P1
recorded: 2026-11-22
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md
deferred: blocked — a roadmap split already puts one phase on a page, the split's floor; a page that still overflows needs the fit model's measured split or spacing rescue (#2988, `fit: pack`), which is not on main
source: https://github.com/Laticent/lattice/pull/3430
---

# A roadmap phase overflows its page at a hall venue on portrait, square and story boxes

why now   — the fit harness (nightly flags) measures every roadmap gallery body page at hall as overflowing: 31px at story (the "Hardening" page, `examples/split-header-hall.md` page 4, whose "Scale →" pointer crowds the pagination), 49–314px at square, 102–574px at portrait. Measured identical on main 7789cce and on #3430, which fixed the same slides' covers and pointers only.
where     — `lib/plugins/chart-family/kinds/roadmap/` (the horizon column at hall type) and the split that pages it (lib/core/split-envelope.js).
done when — every roadmap gallery body page fits at portrait, square and story at a hall venue, or the split packs a phase across pages so none clips; the fit ratchet's roadmap clip counts fall to the new floor.
evidence  — `.scratch` fit-harness rows from #3430: story@hall slides 2/8/10 page 3 overflow 31px; portrait@hall slide 2 pages 2–4 overflow 437/574/462px.
verify    — `npm run fit:harness -- --sizes square,portrait,story --venues hall --packs none --edits none --only kinds/roadmap/ --ratchet test/fit/baseline.json`
