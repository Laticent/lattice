---
origin: 2898
priority: P1
recorded: 2026-10-25
area: engine
severity: high
swimlane: engineering/decisions/2026-09-25-panes-two-components-one-slide.md
source: https://github.com/Laticent/lattice/pull/2898
---

# Every pane on a paginated slide prints its own page number ("1") in its footer

why now   — a pane slide in any paginated deck shows a stray "1" under each pane, beside the
            slide's real page number. It is on every pane example and would ship in 1.0.0.
found     — `node lattice.js examples/pane-photo-fit.md` (and `panes.md`, `pane-layouts.md`):
            each `<lat-pane>` carries its own `<div class="cell-footer"><span class="lat-pagination">1</span>`.
            `pdftotext -f 2 -l 2` of `panes.pdf` finds two lone "1" lines. The committed
            `examples/panes.pdf` (blessed at a6dc26c, 2026-10-20) has none. It is already present at
            8ad68fd^ and at 919689d, so it landed between a6dc26c and 8ad68fd^; PR #2898 did not cause it.
where     — the pane path renders each pane as a cell with the slide's footer cell; the pagination
            transform (`lib/forms/tile/pagination/pagination.transform.js`) or the pane builder should
            give a pane no footer cell. Bisect a6dc26c..8ad68fd^ with `examples/panes.md` page 2.
done when — no `.lat-pagination` inside a `lat-pane`, and page 2 of `panes.pdf` has one page number.
verify    — rasterize `examples/panes.md` and `examples/pane-photo-fit.md`, light and dark, via SendUserFile.
