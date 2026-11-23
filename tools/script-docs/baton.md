---
group: Project queue
---
The relay baton (HARD RULE #31): may this session push to a relay branch now? `status|take|release [branch]` reads the newest non-merge commit's Relay-Actor / Claude-Session trailers and time plus the PR's `<!-- relay-handoff -->` comment; free on `baton: released`, after 60 quiet minutes, or with `--override` when a person said "take over". `rescue` pushes commits git rejected after a lost race to `relay-rescue/<branch>/<session>` (no force). `take` refuses a ready PR (park it first) and a branch parked at the merge gate; `release --gate` parks it. Exit 0 free/yours, 1 held, 3 could not check (engineering/workflow.md §Relay).
