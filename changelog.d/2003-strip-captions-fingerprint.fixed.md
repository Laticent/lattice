- `--strip-captions` no longer names which slides carried a caption. It scrubbed the caption
  comment's span and left its line behind as an empty one, and nothing re-rendered from that
  source — so a captioned slide shipped one byte more than the same slide written without a
  caption, and the shipped source carried a blank-line run wherever a caption had sat between
  two blanks. Both are readable from the exported file alone, since the player envelope carries
  the deck's own source to re-render. The caption strip now takes the same line-aware,
  structure-preserving cut `--strip-notes` took in the previous release (one shared
  implementation, so the two channels cannot drift apart again), and the export renders the
  composed source it actually ships — under one measured cut, because both flags scrub one
  document. (#2003)
- `--strip-captions` also no longer leaves a blank line in front matter where the `captions:`
  map was, and a deck whose front matter held nothing else keeps rendering as it did: an
  emptied `---` / `---` fence is not front matter to the engine, so the whole block goes rather
  than becoming a thematic break in the deck. (#2003)
