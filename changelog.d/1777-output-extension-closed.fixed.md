- **Fixed: `lattice deck.md out.webp` no longer writes a PDF under the name you asked
  for.** The CLI's extension dispatch handled `.pptx`, `.png`, `.zip` and `.html` and fell
  through to the PDF path for **everything else**, so any unrecognized extension exited 0
  and left an artifact whose bytes `file(1)` reads as *"PDF document"* and whose name says
  something else. The table is closed now: an extension that is not `.pdf`, `.pptx`,
  `.png`, `.zip` or `.html` is a usage error that names the supported set and writes
  nothing, and an output path with no extension is refused too (nothing picks the format).
  `.webp` / `.jpeg` / `.jpg` are the ones actually asked for — they are supported formats,
  just as an image set — so their refusal prints the command that does the job:
  `lattice deck.md out.zip --image-format webp`. The refusal runs before Chromium is
  launched, so a typo costs milliseconds instead of a full render.
