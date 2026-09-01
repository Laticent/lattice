- **Added: `tools/wait-for.sh` — the one way to wait for a slow job.** A wait is
  now bounded (default 1800s, ceiling 3600s) and deduped by job name, so a second
  wait on a live job refuses and names the holder instead of piling on. Replaces
  the hand-rolled `until <cond>; do sleep N; done` background call, which had no
  deadline and no identity: one session left fifteen resident, six on the same
  integration run, still polling after five hours. Idling was nearly free; the
  cost was the late fire, which wakes a session past the prompt-cache TTL and
  re-sends the whole conversation at full input price, once per duplicate.
  Contract in `engineering/development.md` §Waiting for a slow job.
- **Added: a PreToolUse hook that coaches toward the bounded wait.**
  `.claude/hooks/warn-unbounded-wait.sh` spots a hand-rolled `while`/`until`
  loop around `sleep` in a Bash call and points at `tools/wait-for.sh`. It warns
  and never blocks, matching `check-commit-msg.sh`'s posture and HARD RULE #29's
  "we warn, we coach" — and it exists because a `check-ownership.js` gate cannot
  reach this at all: that gate walks the repo filesystem, and these waits are
  ad-hoc tool calls that never become files.
