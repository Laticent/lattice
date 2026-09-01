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
#   --force           Replace a live wait on this job -- it STOPS that waiter first.
#
# Exit codes:
#   0    the command succeeded, or the predicate became true
#   1    predicate never became true before the deadline
#   2    refused: another live wait already holds this job name
#   64   usage error
#   124  the command hit the deadline and took the TERM
#   137  the command was SIGKILLed -- either it ignored the deadline TERM, or
#        something else killed it (an OOM). The message says which, from the
#        clock; do not read every 137 as a timeout.
#   143  the wait itself was TERMed (it stops promptly and drops its lock)
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

# `${2:?...}` would exit 1 here, colliding with the documented "predicate never
# became true" code and bypassing this script's own 64-for-usage convention.
need() { [ "$1" -ge 2 ] || die "$2 needs a value"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --job)      need $# --job;      job="$2";        shift 2 ;;
    --timeout)  need $# --timeout;  timeout_s="$2";  shift 2 ;;
    --interval) need $# --interval; interval_s="$2"; shift 2 ;;
    --until)    need $# --until;    predicate="$2";  shift 2 ;;
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
[[ "$interval_s" =~ ^[0-9]+$ ]] || die "--interval must be a whole number of seconds"
# Force base 10. Bash reads a leading zero as OCTAL, so `--timeout 08` passed the
# regex and then blew up in the arithmetic with "value too great for base",
# exiting 1 -- straight into the documented "predicate never became true" code.
timeout_s=$((10#$timeout_s))
interval_s=$((10#$interval_s))
[ "$interval_s" -ge 1 ] || die "--interval must be at least 1 second"
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
lock_file="$lock_root/$job.lock"
log_file="$lock_root/$job.log"

# A waiter may legally outlive the ceiling by timeout's kill-after grace, so a
# lock is only "impossibly old" some way past it.
readonly RECLAIM_AFTER=$((MAX_TIMEOUT + 60))

# The lock is a FILE whose contents are complete BEFORE it exists: pid on line 1,
# claim time on line 2. That ordering is the whole point. Writing metadata after
# creating the lock left a window in which the lock existed with no pid, and a
# second waiter read that as abandoned and stole it from a holder that was still
# mid-claim. Guessing at "probably newborn" only papered over half of it.
lock_field() { sed -n "${1}p" "$lock_file" 2>/dev/null || true; }
lock_owner() { lock_field 1; }
lock_born()  { lock_field 2; }

# Is this pid a live wait-for.sh process?
#
# Three checks, and every one of them has a failure behind it. `kill -0` alone
# says yes to a ZOMBIE -- a killed-but-unreaped holder -- which wedges the job
# name forever. And a pid left by a SIGKILLed holder can be REUSED by something
# entirely unrelated, so believing the number on its own means `--force` would
# send TERM and then KILL to a stranger's process. Verify it is ours before
# trusting it, and certainly before signalling it.
is_wait_process() {
  local pid="$1" state="" args=""
  [ -n "$pid" ] || return 1
  case "$pid" in (*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  if [ -r "/proc/$pid/stat" ]; then
    # Field 2 is the command name in parentheses and may contain spaces, so cut
    # from the LAST ')' rather than splitting on whitespace.
    state=$(sed 's/.*) //' "/proc/$pid/stat" 2>/dev/null | cut -d' ' -f1)
    args=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  else
    state=$(ps -o stat= -p "$pid" 2>/dev/null | tr -d '[:space:]' | cut -c1)
    args=$(ps -o args= -p "$pid" 2>/dev/null || true)
  fi
  [ "$state" != "Z" ] || return 1
  case "$args" in (*wait-for.sh*) return 0 ;; (*) return 1 ;; esac
}

# Stop a holder we are taking the lock from. Reclaiming without stopping it just
# produces the two-live-waiters case the lock exists to prevent: both run to
# their own deadlines and both fire.
stop_holder() {
  local pid="$1" _
  is_wait_process "$pid" || return 0
  kill -TERM "$pid" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    is_wait_process "$pid" || return 0
    sleep 0.5
  done
  kill -KILL "$pid" 2>/dev/null || true
}

# Drop the lock, but ONLY if we still hold it. An unconditional remove is a
# duplicate-admitting bug: a waiter that was forced out would delete the CURRENT
# holder's lock on its way out, and the next wait would walk straight in.
release_lock() {
  [ "$(lock_owner)" = "$$" ] || return 0
  rm -f "$lock_file"
}

# `ln` is atomic and fails if the target exists, so the lock appears only once
# its metadata is already written.
try_claim() {
  local tmp
  tmp=$(mktemp "$lock_root/.claim.XXXXXX" 2>/dev/null) || return 1
  printf '%s\n%s\n' "$$" "$(date +%s)" > "$tmp"
  if ln "$tmp" "$lock_file" 2>/dev/null; then
    rm -f "$tmp"
    return 0
  fi
  rm -f "$tmp"
  return 1
}

claim_lock() {
  try_claim && return 0

  local holder born age
  holder=$(lock_owner)
  born=$(lock_born)
  case "$born" in (''|*[!0-9]*) born=0 ;; esac
  age=$(( $(date +%s) - born ))

  # A live waiter of ours, still inside the longest life it could legally have.
  if is_wait_process "$holder" && [ "$age" -le "$RECLAIM_AFTER" ]; then
    return 1
  fi

  # Otherwise the lock is reclaimable: the holder is gone, is not ours, or has
  # outlived any legal deadline. Stop whatever is still there before taking it.
  stop_holder "$holder"
  rm -f "$lock_file"
  try_claim
}

if ! claim_lock; then
  if [ "$force" -eq 1 ]; then
    # Forcing REPLACES the holder, so it has to stop the holder. Stealing the
    # lock alone left both waiters running to their own deadlines, both firing,
    # and in run mode the second truncating the first's log.
    stop_holder "$(lock_owner)"
    rm -f "$lock_file"
    try_claim || die "could not take the lock for $job even with --force" 2
  else
    printf 'wait-for: refused — job "%s" is already being waited on (pid %s, since %s).\n' \
      "$job" "$(lock_owner)" "$(date -u -d "@$(lock_born)" '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo unknown)" >&2
    printf 'wait-for: let that one finish, or pass --force to replace it.\n' >&2
    exit 2
  fi
fi

child=""

# A signal must STOP the wait, not merely tidy the lock. bash defers trap
# handling until a FOREGROUND child finishes, so a TERM was swallowed for the
# whole job: the waiter kept running and still fired at its deadline. Measured --
# TERM at t=1s on a 12s job exited at t=11s reporting "hit the deadline". Both
# modes therefore run their child in the BACKGROUND and `wait` on it; fixing only
# run mode left poll mode deaf to signals for a full probe.
on_signal() {
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null || true
  release_lock
  exit $((128 + $1))
}
trap 'release_lock' EXIT
trap 'on_signal 15' TERM
trap 'on_signal 2' INT

# ── wait ─────────────────────────────────────────────────────────────────────
started_at=$SECONDS

elapsed() { printf '%ds' "$((SECONDS - started_at))"; }

if [ ${#cmd[@]} -gt 0 ]; then
  # Run mode: one process, bounded. Its exit IS the notification, so there is
  # no second shell polling for it — that pairing is the bug this tool removes.
  status=0
  timeout --signal=TERM --kill-after=10s "$timeout_s" "${cmd[@]}" > "$log_file" 2>&1 &
  child=$!
  wait "$child" || status=$?
  child=""

  rel_log="${log_file#"$repo_root"/}"
  if [ "$status" -eq 0 ]; then
    printf 'wait-for: %s finished OK in %s (log: %s)\n' "$job" "$(elapsed)" "$rel_log"
  elif [ "$status" -eq 124 ]; then
    printf 'wait-for: %s hit the %ss deadline (log: %s)\n' "$job" "$timeout_s" "$rel_log" >&2
    tail -n 20 "$log_file" >&2 || true
  elif [ "$status" -eq 137 ]; then
    # 137 is SIGKILL, which is NOT necessarily the deadline: it is also what an
    # OOM kill looks like. Reporting both as "hit the deadline" would send you
    # hunting a timeout that never happened, so say which the clock supports.
    if [ "$((SECONDS - started_at))" -ge "$timeout_s" ]; then
      printf 'wait-for: %s ignored the deadline TERM and was killed at %ss (log: %s)\n' \
        "$job" "$timeout_s" "$rel_log" >&2
    else
      printf 'wait-for: %s was KILLED after %s, well inside its %ss budget — not the deadline (OOM?) (log: %s)\n' \
        "$job" "$(elapsed)" "$timeout_s" "$rel_log" >&2
    fi
    tail -n 20 "$log_file" >&2 || true
  else
    printf 'wait-for: %s failed with exit %s after %s (log: %s)\n' "$job" "$status" "$(elapsed)" "$rel_log" >&2
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
  # curl with no timeout, a `wait` on a live pid -- would otherwise sail past the
  # deadline, which is the unbounded wait this tool exists to prevent, rebuilt
  # inside it. Measured before the fix: `--until 'sleep 300'` ran a full 2
  # minutes against a 3s deadline. Backgrounded so a signal can land mid-probe.
  probe=0
  timeout --signal=TERM --kill-after=2s "$remaining" bash -c "$predicate" >/dev/null 2>&1 &
  child=$!
  wait "$child" || probe=$?
  child=""

  if [ "$probe" -eq 0 ]; then
    printf 'wait-for: %s became true after %s\n' "$job" "$(elapsed)"
    exit 0
  fi

  # Do not oversleep the deadline either.
  remaining=$((deadline - SECONDS))
  [ "$remaining" -gt 0 ] || break
  sleep "$(( interval_s < remaining ? interval_s : remaining ))" &
  child=$!
  wait "$child" || true
  child=""
done

printf 'wait-for: %s never became true within %ss — the predicate is probably wrong, not the job.\n' \
  "$job" "$timeout_s" >&2
exit 1
