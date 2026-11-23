- **Every deck in the repo is written in `<!-- @meta{…} -->` records.** `lattice migrate meta` rewrote the
  examples, the exemplars, the test decks, the hand-curated galleries and the deck samples in the skills and
  the docs pages: 545 files, and every swept deck renders the same HTML and CSS as before. A new test fails when a shipped
  deck holds an old directive comment (`<!-- _class: … -->`) or a bare `<!-- {…} -->` record.
- **The Studio's single-slide preview keeps a running class written as a record.** A slide after a
  `<!-- @meta{layout=diagram, carry} -->` record previewed without the carried class; it now matches the deck.
