---
origin: 3034
priority: P3
recorded: 2026-11-04
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §6.3
deferred: blocked — owner decision D3 on PR 3034 (numbers the owner set, second filter row 3)
---

# Raise or rebalance the CI time limits that loaded runners now overrun

Overflow sweep 29 of 30 min (cancelled 5 of 15 nights), integration shard 4 about 21 of 25 min, the iOS cold-start waits (90 s editor, 30 s Coach finding), and npm ci with no step limit (one hung 14 min). The ❓ card on PR 3034 proposes 45 / 30 / 150 s / 10 min.

done when — the overflow sweep and integration shard 4 finish under their limits on 7 straight runs, and npm ci has a step limit.
