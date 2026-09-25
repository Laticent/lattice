#!/usr/bin/env bash
# Stop hook: Claude may not finish while the tests fail.
# Exit code 2 sends stderr back to Claude and keeps it working.
input=$(cat)
# Already continuing because of this hook once? Let it stop, to avoid a loop.
echo "$input" | grep -q '"stop_hook_active": *true' && exit 0

log=$(mktemp)
if ! npm test --silent >"$log" 2>&1; then
  echo "Tests are failing. Fix them before you finish:" >&2
  tail -20 "$log" >&2
  exit 2
fi
exit 0
