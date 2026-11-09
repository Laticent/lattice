- **Changed: a commit that changes a regex verdict by hand is refused.** A new pre-commit job,
  `regex-census-recheck`, re-decides with `recheck` every verdict the staged `tools/regex-census.json` adds or changes
  against `HEAD`, and blocks the commit on any that recheck answers differently. `build:check` trusts the table it is
  shown, so before this a typed `"safe"` passed it. The job runs only when the table is staged and costs about a second
  per changed verdict. It needs recheck installed: `npm ci --prefix tools/recheck --omit=optional --ignore-scripts`.
- **Fixed: eleven regular expressions that could take quadratic time on hostile text now run in one pass.** The
  font-face and `var()` scans in the slide camera, the relationship label's clause and punctuation readers, the
  narration's link and Mermaid-directive strippers, the layout gate's fence, autolink and tag scans, and the
  masthead's footer-cell walk each read linearly now. A seeded differential test holds each one to the output of the
  pattern it replaced. Seven tests that timed these paths with a stopwatch now check instead that every regex the
  path runs is linear.
