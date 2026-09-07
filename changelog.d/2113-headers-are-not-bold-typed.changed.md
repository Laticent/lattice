- **Changed: `inventory` supplies its own entry name, so typing `**…**` for one is
  now a no-op.** Its lead was a bare text node in a `font-weight:400` li, so the
  entry name rendered as body prose unless the author typed the bold — emphasis
  meant as decoration was the only thing producing a header. `inventory` joined the
  slot-label lift (`lib/core/slot-label-lift.js`), which is idempotent, so a deck
  written the old way renders exactly as before while new decks write `- Label`.
- **Changed: `inventory` and `redline` rows take the nested `- Label` / `  - body`
  shape.** The lift takes an li's whole lead up to its first nested list, so an
  inline body has nothing to delimit it. Both components' decks, docs, skeletons and
  manifest samples moved with them, and the labels lost their trailing periods to
  match the nested-title convention every other card layout already uses
  (`- First card title`, not `- First card title.`).
- **Fixed: a typed `**Quadrant label.**` on `matrix-2x2` no longer renders LIGHTER
  than a plain one.** The card li is `font-weight:700` and had no `strong` rule, so a
  typed label fell through to `base.elements.css`'s `section strong { font-weight:600 }`
  — emphasis on a header silently took weight away from it. `matrix-2x2` now carries
  the same `li > strong { font-weight:inherit }` rule `verdict-grid` already had.
- **Fixed: a `redline` implication no longer folds its sentence into the label.**
  The mono-caps accent label carries just the label; the operational read sits beneath.
- **Added: `lint:deck` coaches the two lifted layouts** — `lifted-inline-title` on the
  retired inline shape (with an autofix), and `lifted-bodyless-item` on a flat row
  whose whole sentence would be lifted into the header. Warnings, not errors: both
  still render, they just declare or overrun a label the layout owns.
