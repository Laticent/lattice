- **Added: the Studio's edit→paint budget is now a committed baseline with a gate.**
  `bench:check` ratchets the engine in Node; nothing held the warm keystroke a person
  actually feels. `npm run perf:frame:bless` / `perf:frame:check` (in `docs/`) drive the
  real built Studio under CPU throttle and compare against
  `docs/scripts/frame-baseline.json` — FRAME patch 1.1 ms, TOTAL edit→paint 11.4 ms,
  engine RENDER 3.6 ms. A metric must break both the 25% band and an absolute floor to
  fail, so sub-millisecond jitter on a ~1 ms needle cannot redden the gate while a real
  regression still does. A metric the run cannot measure is recorded as null and skipped
  rather than blessed as zero.
