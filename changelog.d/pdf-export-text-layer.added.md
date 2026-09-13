- **Added: the Studio's exported PDF now carries its text.** Every page was a
  picture of a slide, so Cmd-F found nothing, a cursor selected nothing, and a
  screen reader was handed blank pages. The export now measures each word in the
  capture frame and writes it over the page image in PDF text rendering mode 3 —
  invisible ink, the same mechanism OCR output uses. `pdftotext` on a real
  18-page export returns 1,220 words in reading order, and the picture is
  untouched: the image streams are byte-identical page for page and the
  rasterized pages match at AE = 0. The file grows 0.7%.
