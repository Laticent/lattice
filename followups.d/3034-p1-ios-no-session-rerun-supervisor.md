---
origin: 3034
priority: P1
recorded: 2026-11-04
area: infra
severity: high
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §6.1
deferred: blocked — owner decision D1 on PR 3034 (adds a CI job, CLAUDE.md second filter row 2)
---

# Re-run an iOS Simulator job once when no session was ever created (run.sh exit 3)

Four of 15 red nightlies were safaridriver never reaching the simulator. Apple exposes no readiness signal, and the in-job retry runs out of the 30-minute budget (41301950082: 772 s on one failed start). Options and the pick (a workflow_run re-run job) are on the ❓ card on PR 3034. If chosen, run.sh's second-start budget logic can go.

done when — seven consecutive platform-suites nightlies have no iOS job red on 'no session', or the owner picked C on D1.
