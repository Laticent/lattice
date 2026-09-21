- **Fixed: the `--read` byte-identity claim now covers all three raster formats.**
  The docs and `--help` said the PDF, PPTX and PNG are all rendered from the clean
  pre-article document; only the PDF was pinned. `read-export.test.js` now compares
  the PNG set file by file and every `.pptx` zip entry, so moving the article ahead
  of the rasterizer can no longer pass in a format nobody was watching.
