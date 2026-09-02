- **Changed: every `ci.yml` job now carries a `timeout-minutes`.** GitHub's default is
  six hours, and a wedged `npm ci` on node 24 ran 44 minutes in one merge-queue run
  against 16 seconds on node 22 with nothing to stop it. Caps are ~3x the worst
  measured duration per job; only `studio-smoke` had one before.
