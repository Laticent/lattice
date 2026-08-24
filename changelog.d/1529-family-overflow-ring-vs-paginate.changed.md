- **Changed: `check:family-tiers` now says whether a new overflow is a defect or
  baseline drift.** The overflow oracle reported every new clip as
  `NEW CLIPS: … Fix the layout; do not bless it away`, at every `@size`. That is
  true only where no split is available. This sweep sets no `autosplit`, so a clip
  means "overflows when the author has not opted in" — and at a presentation
  `@size` a split-enrolled component paginates instead, which the oracle's own note
  already said ("most of that set paginates in a real export"). The verdict now
  splits the two, keyed on `split-oracle.json` enrollment rather than on size:
  `NEW CLIPS (ring)` keeps the fix-the-layout wording, `NEW CLIPS (paginate)` asks
  for a justified re-bless. A landscape `@size` short-circuits to `ring`, since the
  split move does not run there at all. The `split-oracle.json` read is now one
  `splitEnrollment()` helper shared with `--ladder`.
