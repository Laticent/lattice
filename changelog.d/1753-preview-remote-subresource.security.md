- **Fixed: a deck can no longer beacon the viewer out of a preview frame.** A slide's image —
  a markdown image, a raw `<img>`, or `url()` in an inline style — made the docs-site preview
  fetch an arbitrary external URL on open, leaking the viewer's IP and User-Agent and
  confirming they had opened the deck. Every preview-frame document now carries a
  content-security policy closing images, media, fonts and connections to same-document
  sources. Script and style loading are unchanged, and no deck this repo ships references a
  remote image. **Exports are deliberately not affected**: the Studio's offscreen render frame
  for Download PDF / PPTX / PNG opts out, so a deck's remote image still resolves into the file
  you download, exactly as it does from the CLI. The boundary is that a preview is a surface
  you browse, while an export is a file you asked for.
