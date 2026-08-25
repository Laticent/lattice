- **Changed: the reviewer's golden before/after now covers the whole corpus, not half of
  it.** `golden-diff` diffed only the 150 gallery goldens under `lib/`, so the 201 deck
  goldens under `examples/`, `exemplars/`, `design/`, `themes/` and the CI baseline moved
  with no montage on the PR — a 183-golden change got no visual before/after at all. The
  pathspec is gone and what counts as a golden now comes from `tools/lib/golden-set.mjs`,
  shared with `tools/regression-gate.mjs`, so the gate and the review surface can no
  longer disagree about what the corpus is. Measured on the runner at 272 ms per
  golden-page, the widening costs ~11 s on a typical PR and ~10 min on a full re-bless,
  in a job that gates nothing.
- **Added: a montage cap, because volume is the cost that does not scale.** A triptych
  PNG measures ~150 KB and the full set is both uploaded and pushed to the permanent
  `ci-drift-images` branch; a 184-red run once produced 225 MB. At most 120 montages are
  now produced (~18 MB). Slides past the cap are still counted in the summary table and
  the comment says how many lost their picture — a cap nobody is told about reads as
  "that was everything".
