- **Fixed: the export told authors a family of selectors was safe, and three of them break.** The
  warning read "Selectors that COUNT SLIDES are safe here". Measured in real Chrome on real exported
  files, an 8-slide deck keeping 1/4/6/8: `:nth-child(3 of .kpi)` landed on slide 6 in the whole deck
  and matched **nothing** in the projection; `section:has(blockquote) + section` matched two kept
  slides and then none; and `section:not(:has(blockquote)) + section` matched **three kept slides it
  matched none of in the whole deck** — so a rule that HID something in the deck the sender previewed
  can UNHIDE it in the file they send. The boundary is not "positional CSS": a hole keeps the withheld
  slide's SLOT and carries nothing else — not its class list, not a byte of its content — so counting
  slots holds and asking a question ABOUT a slot does not. Not closable by trying harder, and the
  reason is worth stating: the only hole that could answer these the way the withheld slide did is one
  carrying that slide's classes and content, which is the disclosure the projection exists to prevent
  (a class name is author text — `_class: acquisition-terms` names the thing). The warning, the
  kernel's docblock and the channel table now say all three families, with the measurements.
- **Fixed: two rows of the "MEASURED" channel table certified nothing.** Comparing the projection
  against the whole deck shows a row AGREEING; it cannot show the row would have noticed disagreement.
  `last-of-type` lands on slide 8 with or without the holes, and `nth-of-type(1) ~ section` matched
  every slide but the first, which the restrict-to-kept filter reduced to exactly the kept set on both
  sides. The table now compares a third document — the projection with the holes deleted, i.e. "position
  holding stopped working" — and every row that claims to discriminate must answer differently there.
  One row is marked BLIND rather than dropped: it is preserved AND it cannot tell the difference, and a
  reader will reach for it, so it says so out loud.
- **Fixed: an inline `<!-- caption: -->` was spoken over the wrong slide.** The sixth
  authored-vs-shipped pairing bug in this feature. `slideCaptions` is extracted from the AUTHORED slide
  array and `mergeNarration` reads `captions[i]` at the PAGE index, so the two spaces differ by every
  hole in front of a slide — and by every extra page a split produced, which was already true before
  holes existed. Measured on a 5-slide deck whose `brief` view keeps 1/3/5: page 2 fell back to
  generated speech and page 3 spoke SLIDE 3'S CAPTION OVER SLIDE 5, which is verbatim the misnarration
  `pruneCaptions` was written to kill, still live through the other caption channel. Both channels now
  go through ONE authored → page join, which is the argument the front-matter fix already made.
- **Fixed: a deck that DOCUMENTS the hole marker lost its chart narration.** `isHoleSourceChunk` tested
  whether a chunk CONTAINS `<!-- _class: lens-hole -->`, which is unanchored and fence-blind: a slide
  explaining reader views inside a ```md fence counted as a hole, the source and rendered section
  counts diverged, and chart narration stood down for the whole deck — under a message blaming the deck
  for a divergence the filter had just introduced. The predicate is now equality against the
  projection's hole body, which is the same question `emptyHolePositions` asks.
- **Fixed: two privacy notices were silenced by `--quiet`.** The auto-glossary appendix is built from
  the deck-wide `acronyms:` registry, which the projection does not prune — so a term defined for a
  withheld slide still gets its definition on the appended page — and `--lens-source full` carries every
  slide in the envelope of a file whose pages show a subset. Both rode on the reader-view report line,
  which `--quiet` hides, so the one flag every pipeline passes turned them into no output at all. They
  are warnings now, un-gated, like the author-CSS warning that was deliberately un-gated for exactly
  this reason: a privacy warning `--quiet` hides is a warning nobody reads.
