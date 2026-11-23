- **The repo's decks are written in `<!-- @meta{…} -->` records.** `lattice migrate meta` rewrote the examples, the
  exemplars, the test decks and four hand-curated galleries (design-system, forms, gallery-jargon, the baseline
  gallery): 509 decks, each rendering the same HTML and CSS as before. A new test fails when a shipped deck holds an
  old directive comment (`<!-- _class: … -->`) or a bare `<!-- {…} -->` record; the Marp sample, the LFM-1.0
  conformance cases, two decks that pin the comment forms, and the galleries under `lib/` (until their tools write
  records) are listed with their reasons.
