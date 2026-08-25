- **The four browser benchmark tiers are blessed, so the committed baseline is the
  before/after record HARD RULE #19(b) asks for.** `test/benchmark/baseline.json`
  now carries `exportDatasets` (2 rasterize rows) for the first time, and picks up
  the `cli · imageset look-scratch (svg re-bake)` row that had been reading `NEW
  (re-bless)` since it was added. Blessed as one run
  (`bench:bless -- --export --print --sweep --cli`) because any bless restamps
  `blessedOn` and `calibration` for every tier — blessing them separately files the
  preserved rows under silicon they were never measured on. Blessed on a `@2.10GHz`
  box — the class that set the previous baseline — so the record stays tight: render
  +4.3% / −1.4% / +2.6%, print −0.7% to +4.6%, `index` +5.2% / −0.7% / +3.4%.
  `bench:check -- --export --print --sweep --cli` reports `wall clock GATES` with all
  16 rows `ok`. No workload count moved: every pre-existing `slides` value — and the
  sweep's `overflowing` count — is byte-identical.
- **The sweep's blessed `ratio` is quantization-dominated on sub-millisecond rows, and
  should be read as a floor check rather than a trend.** `normal (jargon)` has been
  measured at 49× / 30.5× / 49× / 16.67× across four runs of an unchanged tree, because
  its `scopedMs` sits at 0.1ms — one timer bucket. Resolution buys stability
  monotonically: `charts` at 0.3–0.4ms varies ±16%, `overflowing (x40)` at 1.4–1.7ms
  varies ±1.7%. The 3× floor the tier actually gates on is untouched and nowhere near.
  Pre-existing and unchanged here; recorded because HARD RULE #19 makes this file's diff
  the sweep rework's durable record.
- **Fixed: a tier left on `TIERS_NOT_YET_BLESSED` after it is blessed re-opens the
  silent-drop hole the list exists to close.** The list was documented as
  self-retiring, on the grounds that `neverBlessed()` also tests the block — but that
  holds only while the block exists, which is the case needing no protection. Delete
  the whole block, which `blessBaseline` does whenever the existing baseline fails
  `JSON.parse`, and the stale name is what decides: the check prints `NOT BLESSED`
  instead of setting drift, and the MISSING loop has no rows left to iterate. The
  rasterize tier's entry is removed as part of blessing it, the list is now empty,
  and an entry must be removed by the bless that earns it.
- **The calibration probe is recorded as unusable on one sandbox class, and fine on
  another.** On a `@2.80GHz` box the render tier ran 30% slower in wall clock than the
  committed baseline while its probe-divided `index` read 27% *faster*, because the probe
  itself moved +80% (2.75ms → 4.94ms). Six consecutive runs there read it at 3.95 / 4.64 /
  4.72 / 4.94 / 5.11 / 5.50ms, and no single blessed value brings all six inside the ±15%
  `PROBE_BAND` — it would need to be at least 4.783 and at most 4.647. An independent run
  on that same fingerprint read 3.78–3.85ms, putting the stamp 22% out of band on its own
  hardware. On a `@2.10GHz` box the same probe reads 2.78 / 2.80 / 2.72ms — a 2.9% spread
  — and gates cleanly. So the defect is machine-class-specific, not intrinsic, and nothing
  in `bench:check` tells you which class you are on except the refusal itself. Measured and
  written down, not changed:
  `engineering/decisions/2026-08-25-calibration-probe-anticorrelation.md`.
