- **Changed: a commit that changes a regex verdict by hand is refused.** A new pre-commit job,
  `regex-census-recheck`, re-decides with `recheck` every verdict the staged `tools/regex-census.json` adds or changes
  against `HEAD`, and blocks the commit on any that recheck answers differently. `build:check` trusts the table it is
  shown, so before this a typed `"safe"` passed it. The job runs only when the table is staged and costs about a second
  per changed verdict. It needs recheck installed: `npm ci --prefix tools/recheck --omit=optional --ignore-scripts`.
