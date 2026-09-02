- **Fixed: `check:jank` could report a clean sweep over ink it never measured.** An
  independent checker found four ways the first cut answered "no collision, exit 0" to a
  question it had not asked. A **generated box is not a child**, so a pseudo painting chrome
  on a text-free wrapper was absent from the measurement entirely — a full-width block lying
  across the section mark read as clean; positioned pseudos are now reconstructed and folded
  into the ink, and an offset in-flow one, whose static position the DOM does not expose, is
  counted and printed as `UNPLACED` so the clean line stops saying `ok`. **Text is not
  bounded by its border box**, so a `nowrap` heading whose glyphs ran 3900px off the slide
  reported zero movement and called its own sweep vacuous; a text-bearing element now
  contributes its scroll extent. **Drift was measured on the block axis only**, so a mark
  that walked 604px sideways — off the slide on the first step — reported `0.0px  ok`.
  And the tool now REFUSES rather than shrugs: an unknown or misspelled flag, a non-numeric
  limit, a `--style` path that does not exist (it injected the path as CSS, so the "sweep
  with the fix neutralized" run silently matched its own baseline and read as proof), and an
  anchor measurable on some slides but not all all exit 2. `--anchor=value` and `--help`
  work; a multi-match anchor says so.
