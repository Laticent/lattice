---
origin: 3269
priority: P3
recorded: 2026-11-17
area: infra
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — a pre-existing gap in a workflow #3269 does not touch, and changing a workflow's filing rule is a CI-contract change the owner decides (CLAUDE.md, second filter, row 2)
source: https://github.com/Laticent/lattice/pull/3269
---

# platform-suites supervisor files a branch run to the shared issue without naming the branch

why now   — #3269's card checker scanned every workflow that writes to an issue. The aggregate platform-suites alert names the ref it ran on; its supervisor's "File the held failure" step does not, and has no main-only guard, so a held failure from a branch dispatch lands on "Nightly platform suites failed" looking like main's.
where     — .github/workflows/platform-suites-supervisor.yml, step "File the held failure (no re-run happened)" (~L79-100).
done when — that step either files only from main (as the nightlies now do) or names the ref it ran on in the body, and the owner has picked which; nightly-alarm-contract.test.js (or a sibling) pins the choice.
evidence  — the step's `if:` is `always() && steps.held.outputs.held != 'false' && steps.rerun.outputs.started != 'true'`, with no `github.ref`; its body prints the run URLs only.
verify    — dispatch platform-suites on a branch with a held failure (or `simulated`) and read what the supervisor files.
