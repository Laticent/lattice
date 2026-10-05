- **Fixed: a thin colored line keeps its color in an exported PDF.** The PDF writer photographs
  each slide's background and stored that photo as JPEG, which blurred a 1 px line on a dark
  slide (the accent rule along its top edge) into a duller color and bled it into the row below.
  The photo is now PNG on a plain slide background, and on a busier one (a photograph, a
  finish's grain) whichever of PNG and JPEG is smaller. This applies to `lattice deck.md out.pdf` and the Studio's Export to PDF. A
  plain 16:9 deck's PDF from the CLI is usually smaller than before: re-rendered, the committed demo
  decks' PDFs came out 16% smaller in total and the component galleries' 25%. CLI export takes about 5-10% longer on a 16:9 deck; a 20-slide Studio export
  about 1.3 s longer. A 4K deck's photo is unchanged for now.
