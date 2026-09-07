- **Fixed: a component's `capacity.note` now renders in its `.docs.md`.** All 23
  components that declare a capacity block author a note, and not one reached the page
  an author (and HARD RULE #6) actually opens — only the machine record in
  `dist/docs/components.json` carried it. The bare numbers are often the smaller half of
  the truth: `team-profile` reads "~6 items (over 12 overflows)" flat while its real
  ceiling is per composition, so an author who trusted the flat number would put twelve
  people on a `bio` slide and lose six.
