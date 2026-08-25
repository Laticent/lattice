- **The palette audit no longer reports AA over rows it never measured.**
  `auditVars`'s verdict counted an unmeasurable pair (`skipped`) as neither a
  failure nor a missing token, so a palette it could not read at all came back
  clean: a map of all 107 contract tokens set to `oklch(50% 0.1 250)` returned
  `ok: true` with **every** row skipped. `ok` now requires that every row was
  actually measured, and each skipped row names the token it could not read. This
  was inert while the pickers were the only producer — they emit hex — and it is
  reachable the moment a theme is hand-edited, which is where `oklch()`,
  `color-mix()` and `#RRGGBBAA` arrive.
- **A fully opaque 8- or 4-digit hex is measured rather than skipped.**
  `#000000ff` is exactly `#000000`, so refusing to read it would be a false alarm
  on a legitimate hand edit. A *translucent* alpha is still not measured: the
  composited color depends on a backdrop a token map does not know, and a ratio
  computed from it would be a confident wrong number.
- **The Fabricate audit panel gained a third state.** An unmeasured row shows as
  `n/a` on `--warn`, naming the operand nobody could read, and sorts between the
  failures and the passes. Painting it red would claim the pair *fails*; hiding it
  would put a red `review` badge over six green checks with nothing to act on —
  the #1457 symptom arriving through the other door.
