- **Fixed: speaker notes on a `split-compare` slide now reach the export.** The layout rebuilt the
  slide from its slots and dropped every comment, so a `<!-- note -->` on it never reached the
  PDF annotations, the presenter view or the HTML player, and `<!-- stress-slide -->` could not
  keep the slide on one page. Affected decks gain the missing note: `examples/studio-present.md`
  slide 3 and `examples/stage-console-split.md` slide 2.
- **Fixed: a long footer on a portrait `split-panel` slide holds one line.** In portrait the
  panels stack and the footer spans the page, and a long caption wrapped onto a second line.
  On a page split into a run it also ran on under the k-of-N rail. It now ends in an ellipsis,
  before the page number and, on a split page, before the rail at its widest.
