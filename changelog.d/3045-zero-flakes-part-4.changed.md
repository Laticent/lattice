- **Changed: a commit that changes a regex verdict by hand is refused.** A new pre-commit job,
  `regex-census-recheck`, re-decides with `recheck` every `safe` verdict the staged `tools/regex-census.json` adds or changes
  against `HEAD`, and blocks the commit on any that recheck answers differently. `build:check` trusts the table it is
  shown, so before this a typed `"safe"` passed it. The job runs only when the table is staged and costs about a second
  per changed verdict. It runs locally only. It needs recheck installed: `npm ci --prefix tools/recheck --omit=optional --ignore-scripts`.
- **Fixed: eleven regular expressions that could take quadratic time on hostile text now run in one pass.** The
  font-face and `var()` scans in the slide camera, the relationship label's clause and punctuation readers, the
  narration's link and Mermaid-directive strippers, the layout gate's fence, autolink and tag scans, and the
  masthead's footer-cell walk each read linearly now. A seeded differential test holds each one to the output of the
  pattern it replaced. Five tests that timed these paths with a stopwatch now check instead that every regex the
  path runs is linear.
- **Fixed: five more slow patterns, added in the agenda and progress work, now run in one pass.** The agenda lint's
  fence and HTML-block strippers, the agenda autofill's class-directive rewrite, and the progress transform's class
  attribute and first-heading reads. Each answers exactly as the pattern it replaced, held by a seeded differential
  test, and a work-count test holds every reader from this change to linear work.
- **Changed: the class-comment strip's speed tests count work instead of timing it.** Four stopwatch asserts in
  `test/unit/authoring/class-comment-strip.test.js` became a read count and a regex trace. They now fail on a
  rescanning strip on any machine, and a loaded runner cannot fail them. The flaky-test baseline drops from 476 to 472.
