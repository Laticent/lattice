- **Fixed: the Studio test "the strip's Undo is the editor's own undo" no longer fails under load.** It typed into
  the editor right after picking slide 2 on the strip, but the editor moves its caret to a picked slide one frame
  later. On a busy machine the text landed in slide 1, the focus followed it back there, and the ⋯ the test then
  clicked was gone before the click, so the slide menu never opened. The test now waits for the caret to reach
  slide 2. Slowing every frame to 200 ms reproduces the old failure every time; with the wait, all 74 cases in
  the file pass with slowed frames.
- **Fixed: renaming a picture no longer slows down sharply on a line with many picture references and backticks.**
  The Studio's rename (`renameAssetRefsOutsideCode`) checked each `asset:` reference against every code span from
  the start, so on such a line the work grew with the square of its length (1.28 MB took 16.5 s). It now walks the
  spans once, in order.
- **Fixed: 92 timing-dependent checks in the docs component tests now wait for what they are about.** Fixed sleeps
  became waits on a signal or fake-timer steps past the product's own timers, and stopwatch assertions became
  counts of work done (HARD RULE #32). `tools/flaky-test-baseline.json` drops from 469 to 377 hits. Two cold-import
  waits in `studio.controls` that ran past their limits under load now carry explicit budgets.
