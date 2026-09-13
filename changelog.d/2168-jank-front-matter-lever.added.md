- `check-jank` gained `--front-matter <key: value>` (repeatable), so a sweep can set deck
  directives the `_class` string cannot reach. It is what finally renders the engine's page
  number — gated on `paginate: true` — and with it that mark is measured for the first time:
  it holds position, no collision.
- **Fixed:** anchor DRIFT no longer counts GROWTH as movement. It was the larger of an axis's
  two edge spreads, so a mark pinned on one edge that merely got wider was reported as having
  moved — the page number, at a constant 30px right inset, was failed for `9.0px` because its
  numeral gained a digit at page 10. It is now the smallest of the near edge, far edge and
  midpoint spreads. A true translation still reports in full.
