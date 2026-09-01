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

if { has "while" || has "until"; } && has "do" && has "done"; then
  printf '%s\n' '{"systemMessage":"This looks like a hand-rolled wait (a while/until loop around sleep). It has no deadline and no identity, which is how one session ended up with 15 orphaned waiters, 6 on the same job. Use tools/wait-for.sh instead: `tools/wait-for.sh --job NAME -- CMD` runs the job and waits as one task, or `--job NAME --until '\''TEST'\''` polls a predicate, bounded. See engineering/development.md § Waiting for a slow job."}'
fi

exit 0
