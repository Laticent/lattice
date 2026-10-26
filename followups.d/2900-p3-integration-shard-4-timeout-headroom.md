---
origin: 2900
priority: P3
recorded: 2026-10-26
area: infra
severity: low
swimlane: engineering/workflow.md
source: https://github.com/Laticent/lattice/pull/2900
---

# Integration shard 4 hit its 25-minute cap on a slow runner

why now   — #2900's run 40245221541 at `a4df38b`: shard 4's venue ratchet was cancelled at the
            25-minute cap with every test so far passing, on a slow runner (apt install took
            3m15s against 9s on shard 3). Shard 4 normally takes 16.5-17 minutes, so the cap
            leaves about 8 minutes of headroom. The gate now fails such a run on a PR (the
            2494 follow-up, done), so a repeat shows red instead of a green beacon.
where     — the `integration` job's `timeout-minutes` in `.github/workflows/ci.yml`. A cap is
            a number the owner set: raising it is the owner's call.
done when — the owner picks: leave the cap (a slow runner re-runs), or raise it to N minutes.
evidence  — the next 10 shard-4 durations from the Actions API, to size N.
verify    — tier 0: a decision, then a one-line change.
