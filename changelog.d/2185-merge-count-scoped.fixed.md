- **Fixed: `engineering/workflow.md` § Merging named a check that does not reproduce.**
  It told you to run `git rev-list --count --merges origin/main` and asserted the answer
  is `0`. Unscoped, it is `33` — all of them pre-queue, PRs #2–#30 under the old
  SlideWright org between 2026-05-12 and 2026-05-27. The command now carries
  `--since=2026-06-30`, the day the merge queue went live, where the answer really is
  zero. The passage also warns that a shallow clone — what the cloud sandbox
  provisions — truncates history and answers `0` for a reason that has nothing to do
  with the queue, so the number agrees with the doc by accident.
