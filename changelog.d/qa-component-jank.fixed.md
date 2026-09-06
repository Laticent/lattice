- **Fixed: `q-and-a` puts its index numeral on the question's baseline, in every look.** The
  counter was an absolutely positioned mark at `top: 0`, which lands its box on the question's
  box rather than its baseline — two fonts at two sizes then put the two baselines wherever
  their own half-leading fell. Measured from the rendered PNG: 7.2px out on the default ledger,
  18.6px on `solo`, and on `grid` it varied 7.7–42.2px *within one slide* as the questions
  wrapped. The pair is a baseline-aligned flex row now, and the numeral measures 0px out.
- **Fixed: the `spine` rail begins and ends on a node.** It was one full-height mark on a
  container that fills the stage while its nodes sit centered in it, so 62px of line dangled
  above the first node and 122px below the last, and the two tails moved independently with the
  content. Each pair now draws its own segment, centre to centre; the last pair draws none.
- **Fixed: `rail` aligns its three columns on one baseline** — the answer sat 7.9px above the
  question's baseline on every row of an exhibit table — **and its numeral reads `01`,** not a
  bare `1`, so one component no longer prints two numbering styles.
- **Fixed: `grid` aligns its question tops at any question length.** The two-line header reserve
  it used instead is a minimum, so a three-line question blew through it and the row went out of
  line anyway (measured 21px apart), while costing 42px of dead air per cell when it did work.
  The cell top-packs instead, and the numeral sits over its own question rather than stranded in
  a gutter the quadrant never used.
- **Fixed: `tab` groups its pairs.** 31px of air inside a pair against 34px between two pairs is
  no grouping at all; the ratio is 2.6 now, at no cost in capacity (the overflow probe first
  flags at the same pair count either way).
- **Fixed: `solo` and `compact` can re-base the index size again.** Both set `--qa-index` on the
  section while the default declared it on `> .cell-stage`, which wins — so `solo`'s numeral
  rendered at the default ledger's 22.4px beside an `--fs-emphasis` question and its own rule was
  dead. The private tokens moved onto the section, where specificity decides.
