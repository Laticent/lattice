- **Changed: a changelog entry is now its own file, `changelog.d/<slug>.<category>.md`.**
  Every PR used to append to one shared `## Unreleased` region, so two PRs in flight
  always edited the same lines — and under a merge queue that is not a conflict you
  resolve once but an **ejection**, which silently clears auto-merge so going green
  again merges nothing. Measured over one evening of five PRs: seven ejections, every
  one a `MERGE_CONFLICT` on `CHANGELOG.md`, every resolution the same mechanical "keep
  both entries"; one PR needed six cycles across about four hours for a change whose
  content stopped moving after the second. Two PRs never write the same fragment file.
  The category lives in the FILENAME rather than in front matter, so deriving the
  release bump is a directory listing that no prose can confuse and a typo is a loud
  gate failure instead of an entry silently dropped from the release. `--bump`,
  `--notes` and `--check` read `## Unreleased` and the pending fragments as one body;
  the release folds them in under their `### Category` headings and deletes them, in
  the commit it already cuts. **Nothing regenerates `CHANGELOG.md` per PR** — a
  build-time assembly would make it a generated-from-everything artifact byte-gated by
  `build:check`, trading a visible conflict for the silent ejection that hazard causes.
  Fragments are ordinary repo prose, so unlike the exempt `CHANGELOG.md` they are in
  scope for the US-English gate. (`engineering/decisions/2026-08-11-changelog-fragments.md`)
