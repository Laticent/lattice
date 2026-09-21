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
