---
group: Project queue
---
Order a merge digest so no two digest PRs conflict with each other: checks every pair of PRs for conflicts the way GitHub merges, then orders by dependency, smaller-first on a conflict, else oldest (input: PR JSON on stdin; `/desk-merge` step 3).
