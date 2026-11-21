---
group: Project queue
---
Order a merge digest: find PRs that conflict with each other and land the smaller of each pair first: checks every pair of PRs for conflicts the way GitHub merges, then orders by dependency, smaller-first on a conflict, else oldest (input: PR JSON on stdin; `/desk-merge` step 3).
