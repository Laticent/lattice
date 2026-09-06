- **Fixed: a diagram written inside a blockquote no longer has its source read
  aloud.** The narration reader trimmed whitespace but not blockquote markers, so
  `> ```mermaid` read as ordinary prose and the definition under it was spoken
  into the captions — on a slide that showed the diagram. The reader strips quote
  markers now, outside a fence and inside one it opened within a quote, so a
  `> ``` ` line in a definition's body still cannot pass for a closer.
