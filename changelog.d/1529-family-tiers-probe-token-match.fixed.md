- **Fixed: `check:family-tiers` no longer reports the `tall` family's stats reflow
  dead at `portrait`.** The probe picked its sample section with
  `className.includes('stats')`, a substring match. At `portrait` the stats slide
  auto-splits into a generated cover plus two native sections, and the cover's class
  is `content lat-split-cover form split-cover-stats` — so the substring matched the
  cover, which carries no `.cell-stage > ol`, and the probe read `MISSING` off a
  section that was never the stats layout. The real sections resolve `column` /
  `nowrap`, exactly what the gate asserts, so the engine was correct throughout and
  the failure was the gate's own. The probe now matches a class TOKEN, the same
  distinction `classTokens` already made for the overflow-oracle half of the same
  file. The oracle half's `NEW CLIPS` findings are a separate, unrelated failure and
  are untouched here.
