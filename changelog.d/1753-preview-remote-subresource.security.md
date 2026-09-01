- **Fixed: a deck can no longer beacon the viewer out of a preview frame.** A slide's image —
  a markdown image, a raw `<img>`, or `url()` in an inline style — made the docs-site preview
  fetch an arbitrary external URL on open, leaking the viewer's IP and User-Agent and
  confirming they had opened the deck. Every preview-frame document now carries a
  content-security policy closing images, media, fonts and connections to same-document
  sources, matching the policy the exported player already shipped. Script and style loading
  are unchanged. No deck this repo ships references a remote image, and a remote image was
  already inert in the exported player — preview now agrees with the export instead of
  rendering something the shared file would not.
