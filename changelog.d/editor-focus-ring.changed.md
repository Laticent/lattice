- **Changed: the deck editors draw the site's own focus ring again.** The Playground's
  deck editor, the Studio's deck Editor and the component-page Specimen now show a 2px
  `var(--accent)` ring while focused, flush with the editor's edge. They had no ring at
  all: the site's one focus rule selects `input`/`textarea`/`[tabindex]`, and
  CodeMirror's editable surface is a `contenteditable` div that matches none of those,
  so the largest text surfaces we ship sat outside the focus language every other
  control shares. The caret alone did meet WCAG 2.4.7, so this is a consistency fix
  rather than a conformance one — the argument, the two measurements that killed the
  conformance framing, and why the ring is a pseudo-element rather than an `outline` are
  in `engineering/decisions/2026-09-13-editor-focus-ring.md`. An embedded `CodeField`
  declines it, because its host already paints the affordance or scrolls the editor.
- **Changed: the focus ring's right edge insets 1px** so a strip of canvas separates it
  from the pane splitter. The splitter paints `--border`, which resolves to the same
  value as `--accent` on onyx, ardesia and the four a11y palettes — flush, the two fused
  into one band and the edge read identically focused and unfocused (1.11:1 on
  onyx/dark). Both of the ring's sides now face the canvas and it clears 5.24:1 on every
  palette.
