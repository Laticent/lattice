- Playground editor: select-all no longer paints a light lavender slab over the
  markdown. The band is the palette's own accent tint again (measured 7.52:1 for
  body text on cuoio-dark, up from 1.21:1), matching the Studio's editor. The
  editor's theme rule was losing on specificity to `@codemirror/view`'s base
  theme, whose `#d7d4f0` selection color it could not out-specify.
- Removed a `requestAnimationFrame` reflow in the Playground editor that was
  added for this symptom on a misdiagnosis (an "iOS Safari system tint"); the
  color was CodeMirror's own, so the reflow never fixed anything.
