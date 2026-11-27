---
"@laticent/lattice": minor
"@laticent/lente": minor
---

Every deck, gallery and sample in the repo is written in `<!-- @meta{…} -->` records, and lint now counts an old comment spelling like any other warning.

- `lattice migrate meta` rewrote the examples, the exemplars, the test decks, the galleries and the manifest samples
  they are built from; every swept deck renders the same HTML and CSS as before. A new test fails when a shipped deck
  holds an old directive comment (`<!-- _class: … -->`) or a bare `<!-- {…} -->` record; the Marp sample, the LFM-1.0
  conformance cases and two decks that show the comment forms are listed with their reasons.
- `lint:deck --strict` (the pre-commit hook and `lint:deck:all`) fails on an old spelling, and the Coach's Contract
  score counts it; until now both set `legacy-directive-comment` aside. `lint:deck --fix` or `lattice migrate meta`
  rewrites a deck in one pass.
- A reader-view (lens) tag is a field of the slide's record. The Studio writes `<!-- @meta{lens="brief -evidence"} -->`
  instead of a `<!-- _lens: … -->` comment and reads either until the cut; toggling a view on a slide with an old
  comment moves the tag into the record.
- `@laticent/lente`: `setLensTagCarrier(carrier)` installs where a host keeps a slide's lens tag (`LensTagCarrier`:
  `read`, `write`); `commentLensCarrier` is the default, the `<!-- _lens: … -->` comment. Lente stays zero-dependency.
