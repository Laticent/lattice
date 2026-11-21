---
origin: 3366
priority: P4
recorded: 2026-11-21
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: off-path — which runner image CI jobs pin is a CI-contract change, outside a dependency bump
source: https://github.com/Laticent/lattice/pull/3366
---

# Recheck the ubuntu-24.04 runner pins now that Playwright is 1.65.1

why now   — five workflows pin `runs-on: ubuntu-24.04` with the comment that Playwright 1.56.1 cannot install browsers on ubuntu-latest (26.04). #3366 moves to 1.65.1; whether 1.65.1 supports 26.04 was not checked.
where     — .github/workflows/ci.yml, perf-nightly.yml, integration-nightly.yml, webkit-baselines-nightly.yml, studio-e2e-nightly.yml (the "Pinned to ubuntu-24.04" comments)
done when — a dispatch run shows whether 1.65.1 installs chromium, firefox and webkit on ubuntu-latest, and the owner has decided to keep or lift the pins, with the comments updated to say which Playwright version they are about
evidence  — engineering/gotchas/ci.md §"Every job that installs a Playwright browser fails at setup"
verify    — a workflow_dispatch of one pinned job with runs-on switched, on a scratch branch
