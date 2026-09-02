- **Changed: `check:jank` now fails on the anchor striking READABLE CONTENT, not on any two
  boxes touching.** Once the ink walk learned to see decorative pseudos, shipped `cycle`
  reported a collision against unmodified CSS — real geometry, entirely deliberate: its hub
  dot is drawn centered *on* the ring it straddles. Crying wolf on a working component is the
  failure mode opposite to a false clean and the more corrosive one, because the next person
  to see it stops trusting the tool. The verdict now keys on text and replaced elements,
  which is the defect the method was built from (#2005's numeral struck the eyebrow text and
  its hairline cut the copy). Decoration overlapping decoration is still **measured and
  printed**, as a `CHROME` advisory — nothing goes unseen, only the verdict changes. A slide
  carrying no text at all falls back to the whole ink, so an image-only layout cannot pass by
  having nothing to measure.
