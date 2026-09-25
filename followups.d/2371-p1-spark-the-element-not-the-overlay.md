---
origin: 2371
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2371
---

# The Guide sparks the named element itself (the SVG line, the bullet, the row, cell or column), not an overlay beside it

why now   — owner, after playing the test deck on 2026-09-25: "we need to have vetrina find, select
            and modify specific elements instead of relying on the overlay. I expect the actual line
            in an svg and/or a bullet point or a table row, cell, column to spark (change color or
            have some other cue that doesn't alter size and shift things)." Today the default
            gesture is Vetrina ink drawn on a layer over the slide, and content marks
            (`markContent`) only run under somber, and on expressive's top moment. They recede the
            peers rather than lighting the target.
where     — docs/src/components/studio/present-guide.ts (`markUnit` already finds the item, the row,
            the chart mark and the series; extend it to cell and column, following `_focus`'s
            `cell`/`col` axes) and lib/base/base.focus.css (a new live "spark" look: accent color
            on text, stroke or fill; a brief color pulse; a marker glyph recolor via the
            `--mark-*` mask tokens; never font-weight, padding, border width or scale, so no box
            moves). A preset field chooses spark-vs-ink per preset. Design note: engineering/decisions/2026-09-25-vetrina-delivery-presets.md §5.
done when — in Present with Guide on, the named bullet, table row, cell or column, and chart line or bar
            changes color in place while it is named, under every preset that sparks. `npm run
            check:jank` reports no box movement across the spark, and the overlay ink shows only
            where the preset still asks for it.
evidence  — screenshots or a short recording from the built Studio on the test deck
            (.scratch/delivery-test.md in #2371) at 1440/820/390, plus check:jank output.
verify    — maker-checker; a visual review of the spark in light and dark.
