- **`obligation-matrix` draws its own marker key.** Until now the key was a prose sentence
  the author retyped on every slide — *"Filled = applies, half = partial, empty = exempt"* —
  bound to nothing, and the component's own docs listed forgetting it as an authoring
  mistake. The grid now builds the key from the markers its cells actually carry, in a
  canonical order, with no key at all when no cell carries one. The five shipped gallery
  slides that restated the key in prose no longer do; that sentence is what the feature
  replaces.
- **Its words can be renamed.** `Applies` / `Partial` / `Exempt` / `Out of scope` suit a
  compliance matrix and not a licensing or diligence grid, so they are now the default
  declared in `obligation-matrix.manifest.json`, overridable with a label set above the
  grid: `` `[{[x], In force}, {[ ], Not subject}]` ``. Naming a subset is the normal case.
  Demo deck: `examples/obligation-matrix-label-sets.md`.
- **The key's swatch takes the CELLS' own classes**, and the stylesheet adds that one class
  to the existing cell-disc selectors rather than restating the recipe. A key painted by a
  different rule than the cells it names is the worst kind of stale legend, because it stays
  plausible. (`lib/components/legal/obligation-matrix/obligation-matrix.styles.css`)
- **A component can now declare WHO draws its key.** `labelSet.keyedBy` is `component` by
  default — a component with a figure builder builds its own, as `roadmap` does — or
  `transformer`, for one that has no section transform at all and so had nowhere to build
  one. The new shared post-pass reads that declaration from the generated catalog rather
  than carrying a list of component names, which is the drift this construct exists to end.
  (`lib/transformers/label-set-key.js`, `lib/components/manifest.schema.json`)
