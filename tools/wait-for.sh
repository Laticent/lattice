#!/usr/bin/env bash
# Wait for one long job — bounded, deduped by job name, and silent until it ends.
#
# This is the ONE way to wait for a slow job in this repo. Do not hand-roll
# `until <cond>; do sleep N; done` into a background Bash call: that shape is
# what produced fifteen orphaned waiters in a single session, six of them on the
# same integration run, still polling five hours later.
#
# Three properties, each fixing one measured failure:
#
#   1. BOUNDED. Every wait carries a deadline and dies at it. An unbounded
#      `until` loop whose condition never matches (the log line was worded
#      differently, the PID came from another shell) runs until the container
#      dies. Worse than idle: when it finally does fire, hours later, it wakes
#      the session with an expired prompt cache, so the whole conversation
#      re-enters at full input price instead of the ~10% cache-read price.
#      The default deadline is deliberately under the session's 1h cache TTL.
#
#   2. ONE WAITER PER JOB. The lock is the job name. A second wait on a live
#      job refuses and names the one already running, instead of adding a
#      duplicate. Five waiters on one job means five wake-ups for one event.
#
#   3. QUIET. Exactly one line of output, at the end. In run mode the command's
#      own output goes to a log; the last lines are echoed only on failure.
#
# Usage:
#   tools/wait-for.sh --job <name> [options] -- <command>...   # run it, bounded
#   tools/wait-for.sh --job <name> [options] --until '<test>'  # poll a predicate
#
# Options:
#   --job <name>      Required. Lock key, [A-Za-z0-9._-]. One live wait per name.
#   --timeout <sec>   Deadline. Default 1800 (30m), max 3600 (the cache TTL).
#   --interval <sec>  Poll gap in --until mode. Default 5.
#   --force           Take the lock even if a live wait holds it.
#
# Exit codes:
#   0    the command succeeded, or the predicate became true
#   1    predicate never became true before the deadline
#   2    refused: another live wait already holds this job name
#   124  the command hit the deadline (GNU timeout's code)
#   *    in run mode, the command's own exit code
#
# Examples:
#   tools/wait-for.sh --job integration -- npm run test:integration
#   tools/wait-for.sh --job docs-server --timeout 120 --until 'grep -q ready /tmp/astro.log'

set -euo pipefail

readonly DEFAULT_TIMEOUT=1800
readonly MAX_TIMEOUT=3600
readonly DEFAULT_INTERVAL=5

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
lock_root="$repo_root/.scratch/waits"

job=""
timeout_s=$DEFAULT_TIMEOUT
interval_s=$DEFAULT_INTERVAL
predicate=""
force=0
cmd=()

die() { printf 'wait-for: %s\n' "$1" >&2; exit "${2:-64}"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --job)      job="${2:?--job needs a value}"; shift 2 ;;
    --timeout)  timeout_s="${2:?--timeout needs a value}"; shift 2 ;;
    --interval) interval_s="${2:?--interval needs a value}"; shift 2 ;;
    --until)    predicate="${2:?--until needs a value}"; shift 2 ;;
    --force)    force=1; shift ;;
    --)         shift; cmd=("$@"); break ;;
    # Print the whole header comment, however long it grows -- a hardcoded line
    # range silently truncated the help once the header gained a section.
    -h|--help)  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)          die "unknown argument: $1" ;;
  esac
done

# ── validate ─────────────────────────────────────────────────────────────────
[ -n "$job" ] || die "--job is required (it is the dedup key)"
# The job name becomes a path component, so keep it to safe characters.
[[ "$job" =~ ^[A-Za-z0-9._-]+$ ]] || die "--job must match [A-Za-z0-9._-]: $job"
[[ "$timeout_s" =~ ^[0-9]+$ ]] || die "--timeout must be a whole number of seconds"
[[ "$interval_s" =~ ^[1-9][0-9]*$ ]] || die "--interval must be a positive whole number"
[ "$timeout_s" -gt 0 ] || die "--timeout must be greater than zero"
# Capped on purpose: past the prompt-cache TTL a wake costs ~10x, so a wait that
# wants longer than an hour is a design problem, not a flag problem.
[ "$timeout_s" -le "$MAX_TIMEOUT" ] || die "--timeout exceeds the ${MAX_TIMEOUT}s ceiling (see this file's header)"

if [ ${#cmd[@]} -gt 0 ] && [ -n "$predicate" ]; then
  die "pass either --until or -- <command>, not both"
fi
if [ ${#cmd[@]} -eq 0 ] && [ -z "$predicate" ]; then
  die "nothing to wait for: pass --until '<test>' or -- <command>"
fi

# ── take the lock ────────────────────────────────────────────────────────────
mkdir -p "$lock_root"
lock_dir="$lock_root/$job.lock"
log_file="$lock_root/$job.log"

# Is this PID a genuinely live holder?
#
# `kill -0` alone is NOT enough, and getting this wrong wedges the lock forever:
# a killed holder whose parent has not reaped it yet is a ZOMBIE, which still
# has a PID entry and still answers `kill -0` successfully. Measured here — a
# SIGKILLed holder sat in state Z and the lock refused every later wait on that
# job. A guard that can never be satisfied is one somebody deletes.
is_live() {
  local pid="$1" state=""
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  if [ -r "/proc/$pid/stat" ]; then
    # Field 2 is the command name in parentheses and may itself contain spaces,
    # so cut from the LAST ')' rather than splitting the line on whitespace.
    state=$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null | cut -d' ' -f1)
  else
    state=$(ps -o stat= -p "$pid" 2>/dev/null | tr -d '[:space:]' | cut -c1)
  fi
  [ "$state" != "Z" ]
}

# `mkdir` is atomic, so two waiters racing for one name cannot both win.
claim_lock() {
  if mkdir "$lock_dir" 2>/dev/null; then
    return 0
  fi
  local holder="" born=0 age=0
  [ -r "$lock_dir/pid" ] && holder=$(cat "$lock_dir/pid" 2>/dev/null || true)
  [ -r "$lock_dir/epoch" ] && born=$(cat "$lock_dir/epoch" 2>/dev/null || echo 0)
  age=$(( $(date +%s) - ${born:-0} ))

  # Second, independent backstop: nothing is permitted to wait longer than the
  # ceiling, so a lock older than that cannot belong to a legitimate wait no
  # matter what the liveness check believes. This is what makes "wedged
  # forever" structurally impossible rather than merely unlikely.
  if is_live "$holder" && [ "$age" -le "$MAX_TIMEOUT" ]; then
    return 1
  fi

  # Owner is gone (or impossibly old) — reclaim rather than block forever on a
  # lock whose holder was killed with -9 and never ran its trap.
  rm -rf "$lock_dir"
  mkdir "$lock_dir" 2>/dev/null || return 1
  return 0
}

if ! claim_lock; then
  if [ "$force" -eq 1 ]; then
    rm -rf "$lock_dir"
    mkdir -p "$lock_dir"
  else
    holder=$(cat "$lock_dir/pid" 2>/dev/null || echo "unknown")
    started=$(cat "$lock_dir/started" 2>/dev/null || echo "unknown")
    printf 'wait-for: refused — job "%s" is already being waited on (pid %s, since %s).\n' \
      "$job" "$holder" "$started" >&2
    printf 'wait-for: let that one finish, or pass --force to replace it.\n' >&2
    exit 2
  fi
fi

echo "$$" > "$lock_dir/pid"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$lock_dir/started"
date '+%s' > "$lock_dir/epoch"
trap 'rm -rf "$lock_dir"' EXIT INT TERM

# ── wait ─────────────────────────────────────────────────────────────────────
started_at=$SECONDS

elapsed() { printf '%ds' "$((SECONDS - started_at))"; }

if [ ${#cmd[@]} -gt 0 ]; then
  # Run mode: one process, bounded. Its exit IS the notification, so there is
  # no second shell polling for it — that pairing is the bug this tool removes.
  status=0
  timeout --signal=TERM --kill-after=10s "$timeout_s" "${cmd[@]}" > "$log_file" 2>&1 || status=$?

  if [ "$status" -eq 0 ]; then
    printf 'wait-for: %s finished OK in %s (log: %s)\n' "$job" "$(elapsed)" "${log_file#"$repo_root"/}"
  elif [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; then
    printf 'wait-for: %s hit the %ss deadline (log: %s)\n' "$job" "$timeout_s" "${log_file#"$repo_root"/}" >&2
  else
    printf 'wait-for: %s failed with exit %s after %s (log: %s)\n' "$job" "$status" "$(elapsed)" "${log_file#"$repo_root"/}" >&2
    tail -n 20 "$log_file" >&2 || true
  fi
  exit "$status"
fi

# Poll mode: the job is already running somewhere else; watch for its signal.
deadline=$((started_at + timeout_s))
while [ "$SECONDS" -lt "$deadline" ]; do
  remaining=$((deadline - SECONDS))
  [ "$remaining" -gt 0 ] || break

  # Each PROBE is bounded too, not just the loop. A predicate that BLOCKS -- a
  # curl with no timeout, a `wait` on a live pid, a read on a pipe nobody writes
  # -- would otherwise sail straight past the deadline, which is the unbounded
  # wait this tool exists to prevent, reintroduced inside the tool. Measured
  # before the fix: `--until 'sleep 300'` ran a full 2 minutes against a 3s
  # deadline. Bounding by the REMAINING time keeps the total honest.
  if timeout --signal=TERM --kill-after=2s "$remaining" bash -c "$predicate" >/dev/null 2>&1; then
    printf 'wait-for: %s became true after %s\n' "$job" "$(elapsed)"
    exit 0
  fi

  # Do not oversleep the deadline either.
  remaining=$((deadline - SECONDS))
  [ "$remaining" -gt 0 ] || break
  sleep "$(( interval_s < remaining ? interval_s : remaining ))"
done

printf 'wait-for: %s never became true within %ss — the predicate is probably wrong, not the job.\n' \
  "$job" "$timeout_s" >&2
exit 1
