- **Fixed: reading speaker notes, reader notes, `describe:` and `say:` lines no longer slows down on a deck with many
  unclosed `<!--`.** `lib/authoring/notes-core.js` read every comment with a pattern that recheck calls polynomial, once
  per opener, so a run of unclosed openers cost the square of its length. A hand-written reader (`CommentScan`) now finds
  exactly the same comments in one pass; a seeded fuzz of 60,000 inputs holds it to the old pattern. Two smaller slow
  patterns in the same file (a trailing-newline trim and the heading-or-rule test, which used a back-reference) are
  linear too.
- **Fixed: the slice-equivalence diagnostic strips tags in linear time.** `sectionText` used a quote-aware tag pattern
  that rescanned to the end of the text from every unclosed `<`; one backward pass now gives the same result.
- **Fixed: the unit tier's stopwatches and sleeps are gone (HARD RULE #32).** 61 timing assertions and fixed sleeps in
  25 files under `test/unit/` now count work, read a virtual clock, or wait for a signal, and each was shown failing on
  the defect it guards.
- **Fixed: a unit test that needs a tool or a built file no longer skips silently in CI (the env-skip rule #3144 adds).** 33 skips in
  15 files route through `skipUnlessCI` / `skipWithoutChrome` (`test/helpers/chrome.js`), which skip on a laptop and
  fail under CI; two carry a `// ci-skip:` note naming the job that runs them instead. chart-readers asserts a pinned
  refusal instead of skipping three tests per refused chart. The `unit` CI job now installs zsh (through
  `.github/actions/apt-cached`), so the interactive zsh completion test runs in CI for the first time.
