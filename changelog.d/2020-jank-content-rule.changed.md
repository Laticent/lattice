- **Changed: `check:jank` now fails on the anchor striking READABLE CONTENT, not on any two
  boxes touching.** Once the ink walk learned to see decorative pseudos, shipped `cycle`
  reported a collision against unmodified CSS — real geometry, entirely deliberate: its hub
  dot is drawn centered *on* the ring it straddles. Crying wolf on a working component is the
  failure mode opposite to a false clean and the more corrosive one, because the next person
  to see it stops trusting the tool. The verdict now keys on text and replaced elements,
  which is the defect the method was built from (#2005's numeral struck the eyebrow text and
  its hairline cut the copy). Decoration overlapping decoration is still **measured and
  printed** — chrome stays in the ink, so `ink top`, `breathe` and CROWDING are unchanged;
  only the COLLISION verdict narrows. A slide carrying no readable content falls back to the
  whole ink, so a text-free layout cannot pass by having nothing to measure. The classifier
  reads the subtree, not the element: a box that only paints does not end the walk, or a
  painting ancestor would turn the heading beneath it into decoration — which it did, on
  every Form component, because `.cell-masthead` carries a hairline. And a generated box is
  decoration only when it generates no text; 20 positioned pseudo rules in the bundle carry a
  counter, an `attr()` or a quoted label.
