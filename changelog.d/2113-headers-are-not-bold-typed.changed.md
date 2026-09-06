- **Changed: `inventory`, `matrix-2x2` and `verdict-grid` supply their own item
  headers, so typing `**…**` for one is now a no-op.** All three keyed their item
  label off markup the author had to type: measured on a probe deck, dropping the
  asterisks left each of them with zero `<strong>` elements, so the header existed
  only because someone typed it — emphasis meant as decoration was load-bearing.
  All three joined the slot-label lift (`lib/core/slot-label-lift.js`), which is
  idempotent, so a deck written the old way renders exactly as before while new
  decks write `- Label` and get the same header.
- **Changed: `inventory` and `redline` rows take the nested `- Label` / `  - body`
  shape.** The lift takes an li's whole lead up to its first nested list, so an
  inline body has nothing to delimit it. A bare `redline` row proved this — it
  lifted `Why this matters. What the amendment changes…` as one label. Both
  components' decks, docs, skeletons and manifest samples moved with them.
- **Fixed: a `redline` implication no longer folds its sentence into the label.**
  The mono-caps accent label now carries just the label; the operational read sits
  beneath it.
- **Added: `lint:deck` warns on the retired inline shape** (`lifted-inline-title`)
  for the two migrated layouts, with an autofix to the nested form. A warning, not
  an error — the old shape still renders correctly, it just declares a label the
  layout already owns.
