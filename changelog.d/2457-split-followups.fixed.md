- **Fixed: speaker notes on a `split-compare` slide now reach the export.** The layout rebuilt the
  slide from its slots and dropped every comment, so a `<!-- note -->` on it never reached the
  PDF annotations, the presenter view or the HTML player, and `<!-- stress-slide -->` could not
  keep the slide on one page. Affected decks gain the missing note: `examples/studio-present.md`
  slide 3 and `examples/stage-console-split.md` slide 2.
