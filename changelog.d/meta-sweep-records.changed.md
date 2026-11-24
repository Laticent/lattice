- **The repo's decks and galleries are written in `<!-- @meta{…} -->` records.** `lattice migrate meta` rewrote the
  examples, the exemplars, the test decks, the hand-curated galleries and the manifest samples the generated galleries
  are built from: every swept deck renders the same HTML and CSS as before. A new test fails when a shipped deck holds
  an old directive comment (`<!-- _class: … -->`) or a bare `<!-- {…} -->` record; the Marp sample, the LFM-1.0
  conformance cases and two decks that show the comment forms are listed with their reasons.
- **An old comment spelling now counts like any other lint warning.** `lint:deck --strict` (the pre-commit hook and
  `lint:deck:all`) fails on it and the Coach's Contract score counts it; until now both set
  `legacy-directive-comment` aside while the repo's own decks were still written that way. `lint:deck --fix` or
  `lattice migrate meta` rewrites a deck in one pass.
- **A reader-view (lens) tag is a field of the slide's record.** The Studio writes a slide's membership as
  `<!-- @meta{lens="brief -evidence"} -->` instead of a `<!-- _lens: … -->` comment, and reads either until the cut;
  toggling a view on a slide with an old comment moves the tag into the record. Lente stays a zero-dependency library:
  a host injects where tags live (`setLensTagCarrier`), and its default is still the comment.
