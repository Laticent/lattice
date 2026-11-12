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
