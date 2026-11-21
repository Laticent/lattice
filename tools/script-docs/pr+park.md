---
group: Project queue
---
Park an open PR as a draft so pushes run no CI (`node tools/pr-draft.mjs park <PR>`, through the session proxy's REST route). Warns when a ci run is still going on the head, since parking does not stop it. Never park a PR in the merge queue. engineering/workflow.md §Iterating on an open PR.
