- The portrait `word-cloud` now fills the canvas it packs into. Word sizes are
  viewBox units and scale by the square root of the area ratio between the landscape
  and portrait pack boxes — but that ratio was read off the full canvas width on both
  sides, and landscape only ever packs into 62% of it (the rest is the key rail).
  The scale was 1.54 where it should have been 1.96, so the cloud rendered 27%
  under-sized and clustered in the middle of a box it could not fill: 63-72% of its
  pack width against landscape's 82-87%. It is now derived from the two pack boxes
  rather than restating their dimensions, so re-tuning either cannot leave the scale
  solved against a box nobody packs. Landscape is byte-identical, no word is lost
  (rendered counts across the nine gallery slides at portrait are unchanged), and
  nothing overhangs its canvas.
