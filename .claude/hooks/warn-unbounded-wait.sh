#!/usr/bin/env bash
# PreToolUse(Bash) nudge toward tools/wait-for.sh when a command hand-rolls an
# unbounded wait. WARNS, ALWAYS. It can never block a tool call.
#
# Why warn and not block. This repo already made this call twice and both times
# landed on coaching: tools/check-commit-msg.sh warns on British spellings and
# never blocks, precisely because a message may legitimately quote British text
# and HARD RULE #14 forbids `--no-verify` as the escape; and HARD RULE #29's
# deck policy is stated outright as "we warn, we coach". A matcher tuned on one
# example blocking a legitimate command, with the usual escape hatch barred, is
# a permanent tax on every future session. A false positive here costs one
# ignorable line.
#
# Why this exists at all, when tools/check-ownership.js could not do it: that
# gate walks the repo filesystem, and the waits that caused this were never
# files. They were ad-hoc Bash tool calls. A PreToolUse hook is the only thing
# in reach that sees one. See engineering/development.md §Waiting for a slow job.
#
# Detection is deliberately coarse -- all of while/until, do, sleep and done
# present, and wait-for.sh absent. It reads the RAW payload rather than parsing
# out the command field, because this runs on every Bash call and the numbers
# decide it: 1.8ms for this, 36ms to start node for an accurate parse. For a
# warning, twenty times the cost on every call is not worth the precision.
#
# One further silence, checked last: if this box cannot RUN tools/wait-for.sh,
# the nudge points at a wall, so it is not printed. See helper_can_run below.

# Deliberately no `-e`: a fault in this hook must never fail the user's command.
set -uo pipefail

payload=$(cat 2>/dev/null || true)

# Fast path first -- nearly every command has no `sleep` in it at all.
case "$payload" in
  *sleep*) ;;
  *) exit 0 ;;
esac

# Already going through the helper? Nothing to say.
case "$payload" in
  *wait-for.sh*) exit 0 ;;
esac

# A real polling loop needs all four. `grep -rn "until.*sleep"` carries two of
# them and is correctly ignored.
has() { case "$payload" in (*"$1"*) return 0 ;; (*) return 1 ;; esac; }

# Coaching that points at a wall is worse than silence. tools/wait-for.sh needs
# TWO things from the box, and refuses with exit 69 if either is missing: a
# timeout(1) for the deadline (macOS ships none -- `brew install coreutils`
# provides gtimeout), and flock(1) or perl for the lock (macOS ships no
# flock(1), but perl by default). On a Mac without coreutils the nudge would
# therefore send you to a tool that cannot run, so say nothing instead.
#
# Checked LAST, and only on a match. `command -v` is a bash builtin doing at
# most four PATH walks, and it runs on the handful of calls that already look
# like a hand-rolled wait -- the ~1.8ms fast path above is untouched.
helper_can_run() {
  { command -v timeout || command -v gtimeout; } >/dev/null 2>&1 || return 1
  { command -v flock   || command -v perl;     } >/dev/null 2>&1 || return 1
}

if { has "while" || has "until"; } && has "do" && has "done" && helper_can_run; then
  printf '%s\n' '{"systemMessage":"This looks like a hand-rolled wait (a while/until loop around sleep). It has no deadline and no identity, which is how one session ended up with 15 orphaned waiters, 6 on the same job. Use tools/wait-for.sh instead: `tools/wait-for.sh --job NAME -- CMD` runs the job and waits as one task, or `--job NAME --until '\''TEST'\''` polls a predicate, bounded. See engineering/development.md § Waiting for a slow job."}'
fi

exit 0
