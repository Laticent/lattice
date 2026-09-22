- **Fixed: an authored line break in a state-chart event label no longer reads as markup.**
  `examples/state-chart-branching.md` authors `needs<br/>second review`, which the component
  documents and draws as a break; the caption carried the markup, so the voice said it. Both
  documented forms — an HTML `<br>`/`<br/>` and a literal `\n` — now read as a space, because
  that break is there to fit the rank gap rather than to separate two phrases. A Mermaid node
  label keeps its pause, where a break usually does separate two things.
