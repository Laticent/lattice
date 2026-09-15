- The portrait `word-cloud` now fills the canvas it packs into, without losing words
  to do it. Word sizes are viewBox units and scale by the square root of the area
  ratio between the landscape and portrait pack boxes — but that ratio was read off
  the full canvas width on both sides, and landscape only ever packs into 62% of it
  (the rest is the key rail), so the cloud rendered 27% under-sized and clustered in
  the middle of a box it could not fill. Growing the type costs words, though, so the
  scale is a ladder rather than a constant: it is walked largest-first and keyed on
  how many words actually place, the same rule `quadrant`'s dot-label ladder uses,
  with no-scaling as the floor rung. A portrait cloud can never paint fewer words
  than an unscaled one, and every shipped slide still takes the top rung. Measured on
  a 15-phrase portrait deck: 11 words painted before, 10 at a flat derived scale,
  12 with the ladder.
- The word cloud now reports the words its packer could not seat. This is the chart
  family's worst silent loss — every other dropped label survives on `data-label`,
  in the speaker note and in the SVG description, but an unplaced word is struck
  from all three. It surfaced a real one immediately: a shipped example deck has been
  dropping a word at landscape, invisibly, since before the diagnostic existed.
