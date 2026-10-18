---
group: Project queue
---
Before pushing to a branch you did not create: list the sessions whose commits are on origin/<branch> beyond main, read from the `Claude-Session:` trailer (non-merge commits, plus merges that carry a trailer). Exit 0 the branch is new, empty, or only yours (`--me session_<id>`, plus any `--allow session_<id>` you took over from; a trailer-less commit only warns), 1 another session's or a malformed trailer is there (do not push), 3 could not check (remote unreachable, fetch failed, or `--no-fetch` with no local ref), 64 bad argument. HARD RULE #31.
