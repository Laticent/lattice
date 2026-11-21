---
group: Project queue
---
Order a merge digest so the queue never ejects one digest PR for another: checks every pair of PRs for conflicts the way GitHub merges, then orders by dependency, smaller-first on a conflict, else oldest (input: PR JSON on stdin; `/desk-merge` step 3).
