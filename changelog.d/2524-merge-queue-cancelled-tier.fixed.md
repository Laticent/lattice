- **Fixed: the merge queue no longer merges a group whose test tier was cut off.**
  The `ci` gate accepted a `cancelled` tier everywhere, because on a PR a newer push
  cancels the older run. Nothing supersedes a merge-queue run, so there `cancelled`
  means a timeout. In the 39 completed queue runs from 2026-09-29 to 2026-10-05, 11
  merged with `integration` cut off at its 25-minute cap. The gate now fails a
  `cancelled` tier in the merge queue, and `integration`'s cap is 45 minutes,
  measured against a p50 of 1372s with 19 of 41 passing runs at 1461-1500s.
