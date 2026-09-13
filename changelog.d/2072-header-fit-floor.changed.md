- **Changed: the Studio header's fit guard now measures the row, not the deck title.**
  `spareAt` in `docs/e2e/studio-header-fit.spec.ts` pins the deck pill at its rendered
  width before searching, so `MIN_SPARE_AT_FLOOR` compares against real row headroom
  (56px at the 700px floor) rather than the pill's own 188px shrink range (246px). The
  floor moves 16 → 48. On the old basis a whole new `icon-sm` control still left 202px of
  reported spare, so no floor in the low tens could ever have fired.
- **Added: an arm that proves the floor can still fire.** It adds a real 38px control at
  700px and asserts the guard catches it (56px → 12px). A guard nobody has watched fail is
  indistinguishable from a decoration.
