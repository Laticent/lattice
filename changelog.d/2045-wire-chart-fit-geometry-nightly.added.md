- The nightly render-regression tier now runs `check:chart-fit` and `geometry:check`. Both
  were written as gates and wired to nothing, so a chart painting outside `.cell-stage`
  (which is `overflow: clip`, so it is cut silently), a body re-deriving an inset the stage
  already owns, or a slide whose geometry depends on the window viewing it could only be
  caught by someone running the script by hand. Both drive a real browser and add ~3 minutes
  to a job that already runs ~2h04m; neither belongs on the PR critical path.
- The nightly's failure-marker list now matches every headline those two arms can print,
  including `check-chart-fit`'s two less obvious ones (`re-derived outer inset(s)` and
  `STALE sanction(s)`). Without that, an arm can fail and the rolling issue shows a bare
  section header with no reason under it — the #1529 defect, which ran for fifteen nights.
- `nightly-alarm-contract.test.js` now checks that a nightly's marker grep actually matches
  its own arms' failure lines, against samples captured from real runs. Nothing in the tree
  could see that before: the question is whether a regex matches text a different file
  prints, and the two files reference each other in neither direction.
