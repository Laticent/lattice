- **Fixed: a diagram in a `--read` article is a drawing with its labels, not empty
  boxes.** Mermaid carries every node label in a `<foreignObject>`, which the article's
  sanitizer removes, so the flowchart shipped as coloured rectangles and arrows with no
  words at all. `--player` never had it because the player branch bakes each diagram to
  a self-styled SVG with native `<text>` first; that bake was gated on `--player` alone
  and now runs for `--read` too.
- **Fixed: a visual-layout slide contributes the description its visual already
  carries.** `state-chart` authors a full sentence for the accessibility tree — every
  state, every transition — and the article threw it away, so that content was absent
  from the only copy a summarizer gets. The projection now emits it as a real
  paragraph. Nothing is synthesized: a component that describes itself nowhere still
  gets the note alone.
- **Fixed: the visual-layout note no longer names a view the artifact may not have.**
  It read "best seen in the Present or Read · Slides view", which is true in the player
  and false in a `--read` export — that document has neither, and its slide stack was
  deliberately removed.
- **Added: the journey board says what it is.** Every other spatial chart already
  describes itself — `state-chart` in its own transform, the keyed charts through
  `svg-legend.js` — and the journey board said nothing anywhere, so a screen-reader user
  got actor initials and a run of bare digits. It now carries a visually-hidden summary
  ("Actors — prospect, user. Discover — Search (prospect), mood 4 of 5; …"), which also
  gives the reading article its content. No pixel moves: verified identical across all
  eight slides of a journey deck.
- **Fixed: a visual-layout note no longer claims a diagram.** It is also the fallback for
  any component that projects to no prose, so it fired on four `content` and two
  `list-criteria` slides of one shipped deck saying "the diagram itself is on the slide".
  It now asserts nothing about what the slide holds.
- **Fixed: a split slide describes itself once, not once per page.** Autosplit copies the
  component onto every page of a run, so a three-page journey printed the same paragraph
  three times in a row — nine in one article.
- **Fixed: the board's own summary is not narrated on top of the board.** It is a text
  alternative for a DOM reader and the article reads it directly, so leaving it in the
  speech walkers made every journey slide narrate its stages twice in the exported `.vtt`.
