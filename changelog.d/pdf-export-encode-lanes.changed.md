- **Changed: the Studio's PDF export is 8-10x faster, with identical pages.** Each
  slide's page image used to go into the PDF through jsPDF's `addImage`, which
  inflates the captured PNG in JavaScript and re-deflates it — about a second a slide.
  The export worker now reads the bitmap's pixels once and compresses them with the
  browser's own `CompressionStream` straight into the PDF. Measured on an 18-page
  deck: Chromium 39.6 s → 4.6 s, Firefox 56.1 s → 5.8 s, WebKit 48.7 s → 6.1 s; a
  56-page deck goes 130.8 s → 14.7 s. Pages are pixel-identical (AE = 0 across 56
  pages), the file is ~5% smaller, and the PDF now reports Lattice as its producer.
  Exporting with comments still puts each note on its own slide — and a comment
  containing a parenthesis or a backslash no longer breaks the notes on that page.
- **Changed: the PDF page-format preference is no longer a speed choice.** "Fast
  (JPEG)" is now "Photographic": with the faster lossless path, PNG measured 4.6 s /
  3.3 MB against JPEG's 4.8 s / 7.4 MB on the same deck — flat color and hard type
  compress better losslessly. JPEG still wins on photo-heavy decks.
