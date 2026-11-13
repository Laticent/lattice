---
origin: 3088
priority: P1
recorded: 2026-11-09
area: engine
severity: low
swimlane: engineering/decisions/2026-06-23-read-across-carousel.md
deferred: off-path — main (756c1ff) clips the same footer on the same page; #3088 changes the roadmap's bands, not the split cover's footer
source: https://github.com/Laticent/lattice/pull/3088
---

# A split cover's footer clips beside its progress marks at story and portrait

why now   — `examples/portrait-roadmap.md` at `--size story` and `--size portrait` reports "CONTENT CLIPPED — page 6". The "Auto-horizons · four quarters stacked" footer on the four-quarter roadmap's split cover ellipsizes to "Auto-horizons · four quarters sta…" beside the run's progress marks. Measured on main at 756c1ff and on #3088: same page, same cut.
where     — the split cover's footer cell, where the run's position marks share the footer row (lib/core/split-envelope.js `footerCell`; the position-marks footer from #2060/#3081).
done when — the footer prints in full beside its marks at story and portrait, or wraps; `node lattice.js examples/portrait-roadmap.md out.pdf --size story` reports no CONTENT CLIPPED.
