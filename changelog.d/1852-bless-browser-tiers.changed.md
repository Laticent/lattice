- **The four browser benchmark tiers are blessed, so the committed baseline is the
  before/after record HARD RULE #19(b) asks for.** `test/benchmark/baseline.json`
  now carries `exportDatasets` (2 rasterize rows) for the first time, and picks up
  the `cli · imageset look-scratch (svg re-bake)` row that had been reading `NEW
  (re-bless)` since it was added. Blessed as one run
  (`bench:bless -- --export --print --sweep --cli`) because any bless restamps
  `blessedOn` and `calibration` for every tier — blessing them separately files the
  preserved rows under silicon they were never measured on. No workload count moved:
  every pre-existing `slides` value — and the sweep's `overflowing` count — is
  byte-identical. Those are the signals that gate on any machine; the wall-clock
  numbers are same-machine only, and on this sandbox class they are best-effort even
  there (see the probe entry below).
- **The sweep's blessed ratio for `normal (jargon)` fell 49× → 30.5×, and it is not a
  scope regression.** `scopedMs` moved 0.1 → 0.2ms — a single timer bucket — and
  6.1/0.2 = 30.5 where 4.9/0.1 = 49; a re-measure on the same box read 29×. The 3×
  floor the tier actually gates on is untouched. Flagged because HARD RULE #19 makes
  this file's diff the durable record of the sweep rework, so a halved ratio should
  not read as a silent loss: the blessed ratio is a floor check, never a trend.
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
  the probe itself moved +80% (2.75ms → 4.94ms). Six consecutive runs on an unchanged
  tree read it at 3.95 / 4.64 / 4.72 / 4.94 / 5.11 / 5.50ms, and no single blessed value
  brings all six inside the ±15% `PROBE_BAND` — it would need to be at least 4.783 and at
  most 4.647. An independent run on the same fingerprint later read 3.78–3.85ms, putting
  the freshly blessed stamp 22% out of band on its own hardware. Measured and written
  down, not changed:
  `engineering/decisions/2026-08-25-calibration-probe-anticorrelation.md`.
