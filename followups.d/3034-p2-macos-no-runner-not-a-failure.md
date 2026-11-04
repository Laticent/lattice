---
origin: 3034
priority: P2
recorded: 2026-11-04
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §5
deferred: blocked — owner decision D2 on PR 3034 (changes the platform-suites alert step and tools/evidence-plan.js)
---

# Stop counting a macOS job GitHub gave no runner as a test failure

19 of 20 red non-iOS macOS jobs on PRs and dispatches (2026-11-02..04) never got a runner. Proposal: the alert job skips jobs with 0 steps and no runner name, and the evidence plan does not dispatch a suite already queued for the same commit. The ci.md entry landed in PR 3034.

done when — a dispatch whose macOS job got no runner neither comments on the nightly issue nor is dispatched twice for one commit.
