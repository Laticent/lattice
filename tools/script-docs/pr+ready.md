---
group: Project queue
---
Mark a parked PR ready so CI runs once on its head, without the race that left #3333 ready with only a skipped run: waits for the push's draft run to finish, marks ready, confirms the new run's `changes` job did not skip, and parks and retries once if it did. Exit 0 done, 1 no real run after two tries, 3 GitHub unreachable or a wait ran out, 64 bad argument. engineering/workflow.md §Iterating on an open PR.
