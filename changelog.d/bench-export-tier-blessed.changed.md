- **The rasterize benchmark tier can now be blessed and checked, not just dumped.**
  `bench:bless -- --export` writes `exportDatasets` into
  `test/benchmark/baseline.json` and `bench:check -- --export` compares against it
  (±50%, same-machine, with the MISSING/workload mirrors the other tiers carry). The
  tier has had the right `{ main, summary }` shape since 2026-08-03, but `main()`
  handed that summary to the `--json` dump and to nothing else, so the only thing
  comparing it was the nightly — head-vs-base on one runner, leaving no durable
  before/after record (HARD RULE #19(b)). The apparatus shipped wired but inert; the
  record was written shortly after, and the block is in the committed baseline.
- **A rasterize cycle that screenshots nothing now fails instead of reporting a
  record time.** `exportTier` swallows a `setContent` failure by design — a
  `networkidle0` timeout over a fully laid-out page is a false alarm — and then
  screenshotted zero sections, which read as an enormous speedup.
  `tools/perf-nightly-compare.mjs` compensated downstream with a `-90%` "workload
  collapsed" heuristic that can only fire where there is a base arm to compare
  against; a `--bless` would have written the broken number into the committed
  baseline with nothing to catch it. The cycle now counts its own screenshots, and
  that count is the blessed workload signal.
- **A benchmark tier this repo has not blessed yet reports rather than failing the
  run.** Drift exits 1 on any machine because a blessed row has been recording
  nothing; a tier nobody has blessed has no rows to rot. Which tiers those are is a
  declared list, not a guess at the block — an absent block cannot distinguish "never
  blessed" from "blessed once and since deleted", and the second is the rot the check
  exists to catch. A partly blessed tier still drifts normally, so a newly added row
  stays red until it is blessed.
