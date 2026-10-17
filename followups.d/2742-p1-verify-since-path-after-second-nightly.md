---
origin: 2742
priority: P1
recorded: 2026-10-17
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-15-conformance-harness.md
---

# the changed-only (`--since`) path and the last-green cache marker have never run in CI; they run only on main

why now   — run 117 had no marker, so it swept all 75; the save step is guarded to main. The first nightly after the merge sweeps all 75 and writes the marker; the second is the first to run `--since`, so a fault there stays hidden until then.
where     — (governing note: engineering/decisions/2026-10-16-player-contrast-galleries.md, on main) .github/workflows/integration-nightly.yml, the "Player contrast sweep" step and the restore/record/save steps; tools/player-contrast-select.js
done when — the second scheduled nightly on main prints a `player-contrast-select:` scope line naming a subset or "nothing render-affecting changed", the restore step found a marker, and the arm is green; paste the step output into the PR
evidence  — the nightly job log for that run (get_job_logs, grep "player-contrast-select")
verify    — tier 0, a log read; tier 1 if the marker is missing or the scope line is wrong, because that means the cache keys or the SHA reachability test are faulty
