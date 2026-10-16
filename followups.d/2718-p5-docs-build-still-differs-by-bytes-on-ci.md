---
origin: 2718
priority: P5
recorded: 2026-10-16
area: infra
severity: low
swimlane: engineering/decisions/2026-09-29-route-budget-soft-hard.md
source: https://github.com/Laticent/lattice/pull/2718
---

# The docs build still differs by a few bytes on CI, so bundle-free PRs owe a declaration

why now   — #2718 bundles nothing, yet CI's route-budget allowance charged it studio +4 and
            playground +1 bytes of eager JS, and it had to add docs/route-budget.d/2718-*.md
            to pass. #2708 hit the same noise. Locally, a build of main 68d9eac and a build of
            the merge with 3f85abb, each in its own worktree, measured identical on every route
            metric. So whatever still varies is specific to CI (#2709 fixed the
            checkout-folder dependence). Every docs-only or test-only PR can pay this tax.
where     — docs/scripts/measure-route-base.sh (the base build) against the PR build in ci.yml's
            docs-build job. Diff the two builds' eager chunks on a runner, not locally: upload
            both dist/ trees as artifacts from one docs-build run and compare file by file.
done when — two CI builds of the same tree measure 0 bytes apart, or the allowance ignores a
            diff smaller than the measured noise and the PR that sets it records the noise.
evidence  — the per-chunk byte diff from one CI run, before and after.
verify    — tier 1 checker: it changes how a merge gate measures.
