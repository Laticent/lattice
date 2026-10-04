- **Fixed: a thin colored line keeps its color in an exported PDF.** The PDF writer photographs
  each slide's background and stored that photo as JPEG, which blurred a 1 px line on a dark
  slide (the accent rule along its top edge) into a duller color and bled it into the row below.
  The photo is now PNG on a plain slide background, and on a busier one (a photograph, a
  finish's grain) whichever of PNG and JPEG is smaller. This applies to `lattice deck.md out.pdf` and the Studio's Export to PDF. A
  plain 16:9 deck's PDF gets larger, about 1.5x on a flat deck (the lossless photo is encoded for
  speed), and export takes about as long as before. A 4K deck's photo is unchanged for now.
