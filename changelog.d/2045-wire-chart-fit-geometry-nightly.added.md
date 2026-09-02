- The nightly render-regression tier now runs `check:chart-fit` and `geometry:check`. Both
  were written as gates and wired to nothing, so a chart painting outside `.cell-stage`
  (which is `overflow: clip`, so it is cut silently), a body re-deriving an inset the stage
  already owns, or a slide whose geometry depends on the window viewing it could only be
  caught by someone running the script by hand. Both drive a real browser and add ~3 minutes
  to a job that already runs ~2h04m; neither belongs on the PR critical path.
- The nightly's failure-marker list now covers both new arms: each of `check-chart-fit`'s
  three finding headlines, `geometry:check`'s two, and — the ones a first cut missed — the
  top-level error each tool prints when it crashes rather than finds something. Without
  those, an arm can fail and the rolling issue shows a bare section header with no reason
  under it, which is the #1529 defect that ran for fifteen nights.
- `nightly-alarm-contract.test.js` now checks that a nightly's marker greps actually match
  its own arms' failure lines, and that a job's two copies of the pattern (run summary and
  issue body) have not drifted apart. Nothing in the tree could see either before: the
  question is whether a regex matches text a different file prints, and the two files
  reference each other in neither direction.
