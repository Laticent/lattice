- **Fixed: `examples/position-marks.md` no longer clips its portrait cover pages.** The
  portrait export splits each `matrix-2x2` slide into a cover page plus card pages, and the
  cover carries the slide's `_footer`. Three footers ran 49–75 characters against a cover
  that fits about 30, so pages 2, 7 and 17 ended in an ellipsis. The footers are shorter
  now, and the deck renders with 0 clipped slides in both light and dark mode.
- **Fixed: `overflow:check` no longer reads a deck it never swept as clean.** The baseline
  (`test/integration/overflow-baseline.json`) now names every deck the blessing run covered
  in a `swept` list. A deck outside that list has no floor, and the check fails on it by
  name (`have NO FLOOR in the baseline`) until a `--bless` records it. Every run also prints
  its cost per deck (`⏱ sweep cost — … s/deck`), so a slowdown shows before the nightly job
  hits its time limit.
