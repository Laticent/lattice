---
origin: 2774
priority: P4
recorded: 2026-11-22
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — deleting a comment on a shared tracker issue is the owner's call (CLAUDE.md second filter, row 1)
source: https://github.com/Laticent/lattice/pull/2774#issuecomment-6255417729
---

# A branch-dispatched nightly left a failure comment on #1845 that is not about `main`

why now   — #2774's session dispatched `integration-nightly.yml` from its branch, and the run
            appended comment 6254071812 (2026-10-18T19:19Z) to the rolling tracker #1845. It
            says `main@ab13bdaa`, but `ab13bdaa` is the branch commit "revert(chart): drop the
            roadmap comment edit". A reader of #1845 takes it as a `main` failure. The cause is
            fixed: the filing step now runs only when `github.ref == 'refs/heads/main'`
            (`integration-nightly.yml`, the `if:` on the issue-filing step). Other comments on
            #1845 from October also name branch commits (for example 6224214011, 6228106730,
            6230327889 and 6235079199, from #2729, #2742 and #2756), so the same call may cover them.
where     — issue #1845's comments; nothing in the tree.
done when — the owner has decided, and each comment that names a non-`main` commit is either
            deleted or left with a reason.
evidence  — the list of comment IDs on #1845 whose `main@<sha>` is not on `main`, with the PR
            each commit came from (`gh api repos/Laticent/lattice/commits/<sha>/pulls`).
verify    — owner call; no code changes.
