- A census pins that every per-slide write path is held to the run's own promise
  (`test/unit/export/artifact-guard-census.test.js`), following the pattern
  `style-guard-census.test.js` established for HARD RULE #22. Behavioral arms prove the artifact
  check WORKS; they cannot prove it is EVERYWHERE, and a format or branch nobody wrote an arm for
  lands green — which is exactly how three of them did. The census pins the guard call-site count by
  value, so adding a write path without a guard, or removing one from a file that still calls it
  elsewhere, has to be a deliberate edit with a reason in review.
- The `--player` carrier was the last write path with no assertion at all; its frame count is now
  checked against the promise, read off the finished string after the CSS and font prune.
