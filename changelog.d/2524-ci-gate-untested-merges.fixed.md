- **Fixed: the required `ci` check no longer passes when the path filter never ran.**
  Every test tier waits on the `changes` job, so when `changes` did not succeed,
  unit, integration and docs-build all read `skipped`, and the gate counted that as
  a pass. `changes` got no runner on #2524's PR run and on the merge-queue groups for
  #2525 and #2535, and both of those merged with no test tier run. The gate now fails
  unless `changes` succeeded.
