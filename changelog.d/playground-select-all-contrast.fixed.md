- Playground editor: select-all no longer paints a light lavender slab over the
  markdown. The band is the palette's own accent tint again (measured 7.52:1 for
  body text on cuoio-dark, up from 1.21:1), matching the Studio's editor. The
  editor's theme rule was losing on specificity to `@codemirror/view`'s base
  theme, whose `#d7d4f0` selection color it could not out-specify.
- Removed a `requestAnimationFrame` reflow in the Playground editor that was
  added for this symptom on a misdiagnosis (an "iOS Safari system tint"); the
  color was CodeMirror's own, so the reflow never fixed anything.
- The selection wash drops from 22% to 18% of `--accent`, on every surface that shows
  it (prose, the Studio's deck editor, CodeField, the Playground's editor) plus the
  matching `::target-text` highlight. At 22%, body text over the band measured 4.32 on
  cuoio/light — the default palette and mode — just under AA; at 18% primary text clears
  4.61 on all 18 palettes in both modes and secondary text clears AA-large 3:1 with
  margin. The band looks all but identical.
