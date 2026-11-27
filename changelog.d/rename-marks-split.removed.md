- **Breaking:** `marks:` is now two keys, `chart-finish:` (pigment, etch or tone, and tone's ink or accent) and `color-intensity:` (muted or vivid), and `lint:deck --fix` rewrites an old deck.
- The engine no longer reads `marks:`. A deck that still writes it renders the default finish and intensity until
  `lint:deck --fix` writes the new lines: `marks: tone ink vivid` becomes `chart-finish: tone ink` and
  `color-intensity: vivid`. The lint is an error, `marks-split`, and its fix leaves out an axis the deck already sets
  with a new key.
- The slide classes follow the keys: `marks-pigment`, `marks-etch`, `marks-tone`, `marks-ink` and `marks-accent` are
  `chart-finish-*`, and `marks-muted` / `marks-vivid` are `color-intensity-*`. The old classes, and the older
  `chart-finish-muted` / `chart-finish-vivid`, are `unknown-class` errors whose fix writes the new class. The class
  names inside an exported HTML deck change with them; the rendered pixels do not.
- `chart-finish:` is a live key again. It takes finish and source words only: an intensity word under it sets nothing,
  and lint names `color-intensity:` for it. The lint rules follow too: `unknown-chart-finish`,
  `unknown-color-intensity` and `chart-finish-source-needs-tone` replace `unknown-marks` and
  `marks-source-needs-tone`, and `marks-renamed` is gone.
- A preset recommends `chart-finish:` and `color-intensity:` in place of `marks:`.
