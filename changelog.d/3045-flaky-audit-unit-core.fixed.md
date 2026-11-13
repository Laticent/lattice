- **Fixed: `test/unit/core` no longer sleeps or races the clock (HARD RULE #32, the flaky-test audit's first folder).**
  All 59 counted hits in 34 files are gone, and `tools/flaky-test-baseline.json` drops from 563 hits in 221 files to
  504 in 187. Nine tests that slept 300 to 1,000 ms "for the runtime" now boot it on a virtual clock and return when
  its timer queue is empty (`test/helpers/runtime-boot.js`). Timeout tests move a mocked clock across their bound. The
  "stays linear on hostile input" stopwatches count the characters each scan covered (`test/helpers/work-count.js`:
  `scanWork`, `charReads`). Where the regression is backtracking inside one regex, which nothing can count, the test
  stays a hang guard sized so the old pattern needs a minute or more, marked `flaky-ok` with both measurements. A
  stress run found four more stopwatches the census cannot see (in chart-row-record, front-matter-scalar,
  lift-bracket-span and slide-camera-faces); they are hang guards now too. Each rewrite whose old code could be rebuilt
  was shown failing on a copy of its module with the defect put back.
- **Fixed: `checkFlakyTests` read a `// flaky-ok:` mark from the wrong line after a string holding U+2028 or U+2029,**
  so every mark below one was ignored.
- **Fixed: a chart row with many trailing pills no longer slows narration with the square of the pill count.**
  `stripTrailingPills` in `lib/core/chart-narration.js` read the remaining lead once per pill (443 ms at 1,600 pills);
  it now reads it once, right to left, and gives the same result on a seeded 20,000-case comparison.
