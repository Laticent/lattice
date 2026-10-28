- **Filo has a page on the docs site.** `/libraries/filo/` runs the real undo history in your
  browser: four writers (an editor, a settings panel, a section list with an AI rewrite, and a lint
  fix) change one document, ⌘Z anywhere on the page undoes the last change whoever made it, and the
  history is drawn as a thread with its saved versions and byte counts. Eight storyboard beats walk
  the guarantees. `/libraries/filo/learn/` explains the model, the calls and the measurements, and
  `/filo` redirects to the demo. Filo gets its own mark (a clew) and a crimson-and-jade palette.
- **`History.steps()`** lists a history's steps for a panel: the done steps oldest first, then the
  redo branch in replay order, each with its label, origin, patch size and time.
- **`@laticent/filo` is a workspace package** like its siblings: `npm run filo-lib:build` writes
  `dist/` (ESM, CJS and type declarations), and `npm run build` runs it. Publishing to npm waits
  until the Studio's use of it has settled.
- **Tables on every library and plugin Learn page read as tables.** A Markdown table now sits in a
  bordered frame with a header band and column rules, like the page's own tables, fills the column,
  and scrolls sideways on its own on a phone.
- **Filo's demo has a played tour.** "Play the tour" runs the real Vetrina library over the page: a
  narrated cursor types, changes the theme, moves a section and lets the AI tighten one, then undoes
  three times from outside the editor. The first real click or key hands the page over.
