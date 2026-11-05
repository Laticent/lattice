---
origin: 3034
priority: P5
recorded: 2026-11-05
area: infra
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §6
deferred: blocked — W1 on PR 3034 is unanswered; the default (leave it) stands until the owner says "fix"
---

# perf-nightly files a regression for noise under its 0.5 floor

docs/scripts/perf-regression.mjs (about line 167) trips the 0.5 score floor on any drop. Mobile pages sit at 0.38–0.49, so a
−0.01 to −0.04 wobble filed a "regression" on 3 of the last 6 nights (issue #2085). Proposal: trip the floor only on a drop
larger than the noise band (`noiseAbs`). It changes what the alarm means, so it waits on the owner.

done when — a week of perf-nightly runs files no regression for a drop inside the noise band, and a drop past it still files one.
