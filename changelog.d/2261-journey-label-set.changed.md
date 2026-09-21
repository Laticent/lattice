- **A journey's mood scale can be renamed at its poles.** `Pain` and `Delight` were string
  literals in the transform — duplicated verbatim in both board builders — and they assert a
  polarity the engine cannot derive. They suit a customer journey and not an on-call
  rotation, a procurement trail or a cost review. They are now the default declared in
  `journey.manifest.json`, overridable with a label set beside the board:
  `` `[{1, Friction}, {5, Flow}]` ``. Naming one pole leaves the other on its default.
  Demo deck: `examples/journey-label-sets.md`.
- **Only the two poles are keyable, and the manifest says why.** The steps between them show
  their number, which IS the scale, so `2` / `3` / `4` are declared in `labelSet.unkeyed`
  with their reason — `lint:deck` quotes it back rather than reporting an unknown key.
- **The rename reaches the key's accessible name.** That `aria-label` was a second
  hard-coded copy of the same two words, so a renamed scale would have left a screen reader
  hearing the old polarity. One source now feeds both.
- **The mood key and the actor key each have ONE builder.** Both were duplicated verbatim
  across the landscape and portrait boards — two copies of a decision is two places to
  change it and one to forget. Pinned by a test asserting the two shapes emit the same key.
  The shipped gallery renders byte-identical.
  (`lib/components/chart/journey/journey.transform.js`)
