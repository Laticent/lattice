---
origin: 3269
priority: P4
recorded: 2026-11-17
area: infra
severity: low
swimlane: engineering/workflow.md
deferred: off-path — a pre-existing step #3269 does not touch, and changing what a nightly step runs on is a CI-contract change the owner decides (CLAUDE.md, second filter, row 2)
source: https://github.com/Laticent/lattice/pull/3269
---

# preview-e2e nightly: a branch run publishes its screenshots to the shared screenshot branch

why now   — #3269's maker-checker read every nightly step that writes somewhere shared. `preview-e2e-nightly.yml`'s "Publish screenshots to artifacts branch" step runs whenever the e2e failed, with no main-only guard, and prunes older run folders, keeping about nine. A branch dispatch with a failure can push out a folder of main's screenshots that the live issue shows inline.
where     — .github/workflows/preview-e2e-nightly.yml, step "Publish screenshots to artifacts branch" (~L126), `if: steps.e2e.outputs.failed == 'true'`.
done when — the owner picks: guard the step to `main`, or let branch runs publish into a folder the prune does not count against main's; nightly-alarm-contract.test.js (or a sibling) pins the choice.
evidence  — the step's `if:` has no `github.ref` check, and its script deletes run folders past the newest nine.
verify    — dispatch preview-e2e-nightly on a branch with a failing e2e, then list the screenshot branch's run folders before and after.
