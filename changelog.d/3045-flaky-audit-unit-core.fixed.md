- **Fixed: `test/unit/core` no longer sleeps or races the clock (HARD RULE #32, the flaky-test audit's first folder).**
  All 59 counted hits in 34 files are gone, and `tools/flaky-test-baseline.json` drops from 563 hits in 221 files to
  504 in 187. Nine tests that slept 300 to 1,000 ms "for the runtime" now boot it on a virtual clock and return when
  its timer queue is empty (`test/helpers/runtime-boot.js`). Timeout tests move a mocked clock across their bound. The
  "stays linear on hostile input" stopwatches count the characters each scan covered (`test/helpers/work-count.js`:
  `scanWork`, `charReads`). Where the regression is backtracking inside one regex, which nothing can count, the test
  stays a hang guard sized so the old pattern needs a minute or more, marked `flaky-ok` with both measurements. Every
  rewritten assertion was shown failing on a copy of its module with the old defect put back.
- **Fixed: `checkFlakyTests` read a `// flaky-ok:` mark from the wrong line after a string holding U+2028 or U+2029,**
  so every mark below one was ignored.
