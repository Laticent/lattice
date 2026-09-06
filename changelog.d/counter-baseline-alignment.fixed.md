- **Fixed: an `inventory` row alone on a split page keeps its ordinal on its own
  title.** The ordinal hung off the row box, so when auto-split gave a row its own
  page — page-tall, prose centered — the numeral had to be centered too. Centering
  its box put it on the *body's* baseline instead, 199px (render px, 2x) below the
  title it indexes, reading as a label for the clause rather than an index for the
  row. It now hangs off the title itself and is carried by the same centering, 2px
  off at the same measurement. Rows that share a page render byte-identical; a row
  authored without a bold lead keeps the previous placement.
