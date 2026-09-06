- **A shared `--player` export now bakes in deck-relative images.** The asset inliner
  matches `file://` URLs only, and the engine deliberately leaves inline `<img src>`
  relative on the CLI path so PDF bytes stay untouched — correct for a PDF, which
  renders with the deck directory as its base, and wrong for a self-contained player,
  which is one file meant to be mailed. A relative `photo.jpg` in it pointed at nothing
  once the file left the deck folder. The player path now resolves those srcs against
  the deck directory before inlining, so they are baked in as data URIs. PDF and PPTX
  bytes are unchanged. Found via `team-profile` — the first component to emit `<img>`
  from a transform, whose portraits all rendered broken — but a bare `![](photo.jpg)`
  on an ordinary `content` slide was affected identically.
