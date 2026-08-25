- **The four browser benchmark tiers are blessed, so the committed baseline is the
  before/after record HARD RULE #19(b) asks for.** `test/benchmark/baseline.json`
  now carries `exportDatasets` (2 rasterize rows) for the first time, and picks up
  the `cli · imageset look-scratch (svg re-bake)` row that had been reading `NEW
  (re-bless)` since it was added. Blessed as one run
  (`bench:bless -- --export --print --sweep --cli`) because any bless restamps
  `blessedOn` and `calibration` for every tier — blessing them separately files the
  preserved rows under silicon they were never measured on. No workload count moved:
  every pre-existing `slides` value is byte-identical, which is the one signal that
  gates on any machine.
- **Fixed: a tier left on `TIERS_NOT_YET_BLESSED` after it is blessed re-opens the
  silent-drop hole the list exists to close.** The list was documented as
  self-retiring, on the grounds that `neverBlessed()` also tests the block — but that
  holds only while the block exists, which is the case needing no protection. Delete
  the whole block, which `blessBaseline` does whenever the existing baseline fails
  `JSON.parse`, and the stale name is what decides: the check prints `NOT BLESSED`
  instead of setting drift, and the MISSING loop has no rows left to iterate. The
  rasterize tier's entry is removed as part of blessing it, the list is now empty,
  and an entry must be removed by the bless that earns it.
- **The calibration probe is recorded as anti-correlated with the datasets it
  normalizes.** On the blessing machine the render tier ran 30% slower in wall clock
  than the committed baseline while its probe-divided `index` read 27% faster, because
  the probe itself moved +80% (2.75ms → 4.94ms). Four consecutive runs on an unchanged
  tree read it at 3.95 / 4.64 / 4.72 / 4.94ms — a 25% spread, wider than the ±15%
  `PROBE_BAND` it is used to enforce. Measured and written down, not changed:
  `engineering/decisions/2026-08-25-calibration-probe-anticorrelation.md`.
