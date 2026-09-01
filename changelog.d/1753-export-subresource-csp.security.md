- **Security: a downloaded `.html` or `--fluid` deck no longer phones home when someone opens
  it.** A deck's remote image, `<video>`, or `url()` in an inline style fired on the
  **recipient's** machine, on every open, leaking their IP and confirming they opened the file —
  measured at two requests per artifact. Both now carry the same narrow policy the docs-site
  preview frames use, and it lives in one shared kernel so an author's preview and their
  reader's file cannot disagree. The exported `--player` was already contained.
- **Unchanged on purpose: PDF, PPTX and PNG still fetch.** There the request happens on the
  exporting author's machine and the recipient receives baked pixels, so containing it would
  blank a picture the author asked for and buy the recipient nothing. The policy is applied
  after rasterization, so those bytes do not move.
