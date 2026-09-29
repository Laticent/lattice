- **Fixed: a thin colored line keeps its color in an exported PDF.** The PDF writer photographs
  each slide's background and stored that photo as JPEG, which blurred a 1 px line on a dark
  slide (the accent rule along its top edge) into a duller color and bled it into the row below.
  The photo is now PNG wherever that is the smaller file, which on a plain slide background it
  usually is, and a 4K slide is no longer photographed below its own size. This applies to
  `lattice deck.md out.pdf` and the Studio's Export to PDF. Plain 16:9 decks get a little
  smaller; 4K decks get larger.
