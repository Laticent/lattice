- **Fixed: the Studio library tests (`docs/src/lib`) no longer pass or fail on the machine's speed.** 96 places in
  39 test files slept for a fixed time, timed a window, or drew an unseeded random name. Each now waits on the
  signal the next check reads, runs on a virtual clock with exact values, or counts the work done instead of the
  milliseconds. Every rewrite was shown failing on a broken product line. Two stopwatches had read the suite's fake
  clock and could never fail; they are work counts now.
- **Fixed: the Studio's unit tests now run the library source, not a leftover build.** Every test that imported one
  of the 17 `docs/src/lib` packages (cadenza, segno, vetrina and the rest) by folder ran that package's built,
  gitignored `dist/`, so an edit to the source changed nothing until someone rebuilt it, and a stale build decided
  the result. `docs/vitest.config.ts` now sends each such import to the source file the package exports. With
  `recorder.ts` broken and its build left stale, `recorder.test.ts` passed before and fails now.
