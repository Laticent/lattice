- **Changed: every `ci.yml` job now carries a `timeout-minutes`.** GitHub's default is
  six hours, and `npm ci` on node 24 wedged twice in one day — 42m23s and 75m58s against
  16 seconds on node 22 — with only `studio-smoke` capped. Caps are sized from the last
  100 completed runs, and the two thin spots are documented rather than averaged away:
  `studio-smoke` sits 71 seconds inside its (pre-existing) cap because of an unbounded
  Playwright browser download, and `golden-diff`'s duration scales with how many goldens
  a PR moves.
