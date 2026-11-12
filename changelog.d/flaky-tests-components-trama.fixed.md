- **Fixed: `test/unit/components` no longer sleeps or races the clock (HARD RULE #32).** All 19 counted hits in 6
  files are gone, and `tools/flaky-test-baseline.json` drops from 171 hits in 79 files to 152 in 73. `packCollage`
  (an opt-in `opts.work`) and the tiered hub-spoke layout (`meta.work`) now report how much their search did, so their tests bound
  arrangements and label passes instead of milliseconds. The flowchart live-layout tests drive the pipeline's 300 ms
  pause and 3 s worker deadline on a virtual clock (`virtualClock` gained `settle({ done })` and `advance(ms)`), and
  now check the pause at 1 ms short of it. Each rewrite was shown failing with its defect put back.
- **Fixed: a speaker note holding a long run of blank lines no longer stalls the linter and the deck model.**
  `readIsland` in `lib/core/directive-island.mjs` tested a regex whose two `\s*` split the blank lines every way:
  192 ms at 20,000 lines, about 19 s at 200,000. It reads the leading whitespace in one pass now, and gives the same
  answer as the old pattern on 20,000 seeded draws.
- **Fixed: `test/unit/trama` no longer sleeps (HARD RULE #32).** `pipeline-draw.test.js` slept 17 times, up to
  1.9 s, around the pipeline's font deadline, its re-check timer and the live settle's pause. Its windows now run on
  the virtual clock, so the 2 s deadline is checked 1 ms short of it and at it, and the baseline drops to 135 hits in
  72 files. Nine mutations of the built pipeline each fail a test.
