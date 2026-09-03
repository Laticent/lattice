- **A `list-tabular` status marker survives every list shape an author writes.** An
  adversarial pass found the marks cell decoding correctly only for the one shape it
  was written against. Fixed, each measured on a real render: a LOOSE list (blank
  lines between bullets) wraps its content in a `<p>`, which the runtime mirror read
  as "no marker" — so a Marp render left a typed `[x]` on the slide while the engine
  stripped it — and which the CSS could not reach through, so the disc computed
  0×19px and `[x]` and `[ ]` drew identically; a marker inside a bold run or a link
  label was stripped out of the author's own markup; a nested numbered sublist and a
  top-level bullet list were decoded into markup the component does not render. The
  two paths are now checked against each other on ten list shapes, not one, by
  booting the real runtime bundle and comparing its output to the engine's.
- **Nothing in a `list-tabular` row's trailing column is painted over.** Two marks
  bullets on a row, or the legacy three-line meta beside one, both landed on the same
  grid cell — and a grid item does not push, it overlaps, so the first simply
  vanished. The cell auto-places down the column instead, which covers every shape
  rather than the one a `:has()` guard knew about.
- **The status disc names itself without putting a word in the document.** It carried
  a visually-hidden span, which is still text: it jammed into the spoken narration
  ("donestable") and printed on the slide on a split page, whose section does not
  carry the class the clip rule was scoped to. The word rides `role="img"` +
  `aria-label` now, and split pages draw the disc.
