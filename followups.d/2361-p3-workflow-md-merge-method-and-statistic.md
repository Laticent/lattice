---
origin: 2361
priority: P3
recorded: 2026-09-25
---

# workflow.md sanctions rebase-merge the queue never does, and cites a statistic that does not reproduce

why now   — §Batch calls a batched PR "the sanctioned rebase-and-merge case", yet all 983 commits
            since the queue went live are single squashes. Its motivating "48 of 50 merges on two
            days" measures 128 first-parent commits on a full clone (chapter 3, "Where practice
            diverges").
where     — `engineering/workflow.md` §Batch a session's slices and §Merging.
done when — the two sections agree on the merge method and the statistic is re-derived with a
            quoted base sha, or removed.
evidence  — the command and its output in the commit body.
verify    — tier 0 self-review plus re-derivation.
