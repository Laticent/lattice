- **Changed: every `ci.yml` job now carries a `timeout-minutes`.** GitHub's default is
  six hours, and `npm ci` on node 24 wedged four times in 26 hours — 75m58s, 42m23s,
  29m11s and 11m04s, all on node 24, against 16–19s on node 22 — with only
  `studio-smoke` capped. The caps are ~3x an initial reading, checked afterwards against
  the last 100 completed runs; that check held everywhere except `studio-smoke`, which
  sits 71 seconds inside its (pre-existing, unchanged) cap because of an unbounded
  Playwright browser-and-deps install. Noted in the workflow: 15m on `unit` catches three
  of those four wedges, not all of them, and `golden-diff`'s duration scales with how
  many goldens a PR moves.
