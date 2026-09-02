- **Changed: the hand-rolled-wait nudge stays silent where its fix cannot run.**
  `.claude/hooks/warn-unbounded-wait.sh` now checks that this box can actually
  run `tools/wait-for.sh` before printing — the helper refuses with exit 69
  unless a `timeout(1)` and either `flock(1)` or perl are present, and a stock
  macOS ships neither `timeout` nor `flock(1)`. Coaching toward a tool that
  exits 69 is worse than saying nothing. The check runs last and only on a
  match, so the hook's cost on an ordinary Bash call is unchanged.
