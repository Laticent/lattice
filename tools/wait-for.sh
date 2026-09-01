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
# Logs are disposable, so they stay in .scratch. The LOCK is correctness state
# and must not: CLAUDE.md calls .scratch throwaway, and `rm -rf .scratch` or
# `git clean -fdx` during a live wait lets a second waiter create a FRESH inode
# and take the lock while the first is still running. Reproduced. `.git/` is
# never touched by git clean and is already per-checkout and untracked.
log_root="$repo_root/.scratch/waits"
# --absolute-git-dir, NOT --git-dir. The latter prints ".git" RELATIVE to the
# repo root, and this script never cds there, so the lock path resolved against
# the CALLER's cwd: the same job started from two directories took two different
# locks and both ran. Reproduced -- the exact "two live waiters on one job"
# failure the flock design exists to delete -- and it also littered a stray
# .git/lattice-waits/ wherever the caller happened to be.
lock_root="$(git -C "$repo_root" rev-parse --absolute-git-dir 2>/dev/null || echo "$repo_root/.git")/lattice-waits"

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
# Must not START with '-', or a swallowed value (`--job --force -- ...`) locks
# under the key "--force" instead of failing.
[[ "$job" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
  || die "--job must start alphanumeric and match [A-Za-z0-9._-]: $job"
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
#
# `flock`, not a hand-rolled mutex. This is the fourth version of this lock and
# the first correct one; the previous three were defeated by review in six
# different ways, all the same failure -- two live waiters on one job. mkdir,
# then an atomic hard link, then a reclaim path guarded by pid liveness and age:
# every one of them needed compare-and-swap semantics that a create plus a
# separate remove cannot provide, and each fix opened a new hole.
#
# The kernel already has the primitive. `flock -n` is atomic, and the lock is
# released when the holding process dies -- SIGKILL, OOM, a pulled container,
# anything. So the entire class simply stops existing:
#
#   no stale-lock detection      the kernel frees it when we die
#   no zombie handling           a zombie holds no lock
#   no pid-reuse hazard          identity is the open file, not a number
#   no age backstop              nothing to time out
#   no reclaim race              there is no reclaim
#   no unlink on release         the file is never deleted, so it cannot be
#                                deleted out from under another holder
#
# The file's CONTENTS are now purely informational -- who to name when refusing,
# and who to signal on --force. Every correctness decision is the kernel's.
mkdir -p "$lock_root" "$log_root"
lock_file="$lock_root/$job.lock"
log_file="$log_root/$job.log"

# Append-mode open: it must NOT truncate, or opening would wipe the live
# holder's details before we know whether we can have the lock.
# Which locking mechanism? Resolved once, and overridable so the fallback is
# TESTED rather than shipped as dead code -- an untested second path is how this
# tool kept breaking.
lock_impl="${WAIT_FOR_LOCK_IMPL:-}"
if [ -z "$lock_impl" ]; then
  if command -v flock >/dev/null 2>&1; then lock_impl=flock
  elif command -v perl >/dev/null 2>&1; then lock_impl=perl
  else lock_impl=none
  fi
fi
case "$lock_impl" in
  flock) command -v flock >/dev/null 2>&1 || die "flock requested but not found" 69 ;;
  perl)  command -v perl  >/dev/null 2>&1 || die "perl requested but not found" 69 ;;
  none)  die "no locking mechanism found: install flock (util-linux) or perl" 69 ;;
  *)     die "unknown WAIT_FOR_LOCK_IMPL: $lock_impl" 64 ;;
esac

# The deadline needs GNU timeout(1), and macOS ships none -- so the perl lock
# fallback ALONE does not make this tool run there. Unguarded, the failure lied:
# run mode reported `failed with exit 127`, blaming the user's command for the
# tool's missing dependency, and poll mode burned the whole deadline and then
# said "the predicate is probably wrong, not the job" when the predicate was
# fine. coreutils installs it as `gtimeout` on macOS, so prefer that when the
# GNU one is absent.
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_BIN=timeout
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_BIN=gtimeout
else
  die "no timeout(1) found: install GNU coreutils (on macOS: brew install coreutils, which provides gtimeout)" 69
fi

exec 9>>"$lock_file" || die "cannot open lock file $lock_file"

# Take the lock on fd 9, whichever mechanism this box has.
#
# `flock(1)` is util-linux and macOS does not ship it -- but macOS does have the
# flock(2) SYSCALL, and perl's `flock` builtin is a thin wrapper over it, with
# perl present by default there. So the fallback is the same kernel primitive
# reached another way, not a weaker imitation: measured here to refuse while
# held, and to be released by the kernel on SIGKILL, exactly like flock(1).
#
# The subtle part is that perl locks the open file description that BASH holds
# on fd 9 (`>&=` duplicates the description, not just the number), so the lock
# survives perl exiting and lasts as long as this shell. Measured, because
# reasoning about POSIX lock lifetimes is how you get this wrong.
#
# Both return 1 for HELD and something else for a fault. Folding every non-zero
# into "held" made a broken environment report `refused -- already being waited
# on (pid , since )` forever, with --force equally stuck.
take_lock() {
  local rc=0
  case "$lock_impl" in
    flock) flock -n 9 || rc=$? ;;
    perl)  perl -e 'use Fcntl ":flock"; open(my $fh, ">&=", 9) or exit 3; exit(flock($fh, LOCK_EX|LOCK_NB) ? 0 : 1)' || rc=$? ;;
  esac
  case "$rc" in
    0) return 0 ;;
    1) return 1 ;;
    *) die "lock attempt ($lock_impl) failed with exit $rc on $lock_file" 69 ;;
  esac
}

holder_pid()   { sed -n 1p "$lock_file" 2>/dev/null || true; }
holder_since() { sed -n 3p "$lock_file" 2>/dev/null || true; }

# Is this pid a live waiter on THIS job?
#
# Only used to decide whether --force may signal it. Kept exact: an earlier
# version matched the job as a substring, so `--job int` matched a live
# `--job integration` waiter and --force TERM+KILLed it.
is_our_waiter() {
  local pid="$1" args=""
  [ -n "$pid" ] || return 1
  case "$pid" in (*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  if [ -r "/proc/$pid/cmdline" ]; then
    args=$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null || true)
  else
    args=$(ps -o args= -p "$pid" 2>/dev/null | tr ' ' '\n' || true)
  fi
  case "$args" in (*wait-for.sh*) ;; (*) return 1 ;; esac
  # One argument equal to the job name, not merely containing it.
  printf '%s\n' "$args" | grep -qxF -- "$job"
}

if ! take_lock; then
  if [ "$force" -ne 1 ]; then
    printf 'wait-for: refused — job "%s" is already being waited on (pid %s, since %s).\n' \
      "$job" "$(holder_pid)" "$(holder_since)" >&2
    printf 'wait-for: let that one finish, or pass --force to replace it.\n' >&2
    exit 2
  fi

  # --force REPLACES the holder, so it must stop the holder: leaving it running
  # is the two-waiters case this lock exists to prevent.
  # The holder is written just after the lock is taken, so --force can still
  # land in a window where the file is empty (or on a job's first-ever use).
  # Give it a moment to appear rather than sending no signal at all and then
  # timing out against a holder we were meant to replace.
  victim=$(holder_pid)
  if [ -z "$victim" ]; then
    for _ in 1 2 3 4 5 6; do
      sleep 0.5
      victim=$(holder_pid)
      [ -n "$victim" ] && break
    done
  fi
  if is_our_waiter "$victim"; then
    kill -TERM "$victim" 2>/dev/null || true
  fi
  # Then simply wait for the kernel to hand the lock over. However the holder
  # goes away -- our TERM, its own deadline, a KILL from elsewhere -- the lock
  # is released, so there is nothing to reclaim and no window to race.
  taken=0
  for _ in $(seq 1 20); do
    take_lock && { taken=1; break; }
    sleep 0.5
  done
  if [ "$taken" -ne 1 ] && is_our_waiter "$victim"; then
    kill -KILL "$victim" 2>/dev/null || true
    for _ in 1 2 3 4; do
      take_lock && { taken=1; break; }
      sleep 0.5
    done
  fi
  [ "$taken" -eq 1 ] || die "could not take the lock for $job even with --force" 2
fi

# We hold it. Publish who we are, for anyone we later refuse. ONE redirection,
# so the truncate and the write are a single open rather than a window in which
# a reader sees an empty file and reports a blank holder.
printf '%s\n%s\n%s\n' "$$" "$job" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$lock_file"

child=""

# A signal must STOP the wait, not merely tidy up. bash defers trap handling
# until a FOREGROUND child finishes, so a TERM was once swallowed for the whole
# job: the waiter kept running and still fired at its deadline. Measured -- TERM
# at t=1s on a 12s job exited at t=11s reporting "hit the deadline". Both modes
# therefore run their child in the BACKGROUND and `wait` on it; fixing only run
# mode left poll mode deaf for a full probe.
#
# There is no lock cleanup here, and that is the point: the kernel releases it
# when this process ends, by any means. The previous versions needed an EXIT
# trap, and a bug in exactly that trap let an exiting waiter delete the lock of
# whoever had replaced it.
on_signal() {
  [ -n "$child" ] && kill -TERM "$child" 2>/dev/null || true
  exit $((128 + $1))
}
trap 'on_signal 15' TERM
trap 'on_signal 2' INT

# ── wait ─────────────────────────────────────────────────────────────────────
started_at=$SECONDS

elapsed() { printf '%ds' "$((SECONDS - started_at))"; }

if [ ${#cmd[@]} -gt 0 ]; then
  # Run mode: one process, bounded. Its exit IS the notification, so there is
  # no second shell polling for it — that pairing is the bug this tool removes.
  status=0
  # `9>&-` closes the lock descriptor in the CHILD. Without it the child
  # inherits fd 9 and keeps the flock held after this script dies, so a
  # SIGKILLed waiter left its job wedged until the child finished -- the exact
  # stale-lock problem flock was adopted to delete. Measured.
  "$TIMEOUT_BIN" --signal=TERM --kill-after=10s "$timeout_s" "${cmd[@]}" > "$log_file" 2>&1 9>&- &
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
  "$TIMEOUT_BIN" --signal=TERM --kill-after=2s "$remaining" bash -c "$predicate" >/dev/null 2>&1 9>&- &
  child=$!
  wait "$child" || probe=$?
  child=""

  if [ "$probe" -eq 0 ]; then
    printf 'wait-for: %s became true after %s\n' "$job" "$(elapsed)"
    exit 0
  fi

  remaining=$((deadline - SECONDS))
  [ "$remaining" -gt 0 ] || break
  sleep "$(( interval_s < remaining ? interval_s : remaining ))" 9>&- &
  child=$!
  wait "$child" || true
  child=""
done

printf 'wait-for: %s never became true within %ss — the predicate is probably wrong, not the job.\n' \
  "$job" "$timeout_s" >&2
exit 1
