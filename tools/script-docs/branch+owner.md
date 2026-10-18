---
group: Project queue
---
Before pushing to a branch you did not create: list the sessions whose commits are on origin/<branch> beyond main, read from the `Claude-Session:` trailer. Exit 0 the branch is new or only yours, 1 another session owns commits there (do not push; branch from it), 64 bad argument. `--me session_<id>` names you; `--no-fetch` skips the fetch. HARD RULE #31.
