---
origin: 3081
priority: P1
recorded: 2026-11-08
area: infra
severity: medium
swimlane: .github/workflows/overflow-nightly.yml
deferred: large — needs a bisect across six weeks of trees plus a sharding decision for the owner
source: https://github.com/Laticent/lattice/pull/3081
---

# The overflow nightly is close to its 45-minute limit

why now   — the sweep took 2267 s on the 2026-11-07 nightly and 2111 s on a 4-vCPU sandbox
            (2026-11-08), against `timeout-minutes: 45` (2700 s). The 11-04 and 11-05 runs
            timed out and measured nothing. Cost per deck rose from about 1.2 s to about 4.2 s
            while the corpus grew 1.6x, and the biggest jump falls between 09-27 and 09-28.
where     — `tools/check-overflow-corpus.js` (prints `⏱ sweep cost` every run since #3081),
            `.github/workflows/overflow-nightly.yml`. Suspect commit: 268f0a3f9, not bisected.
            Trees older than the `--size` flag reject it, so drop `--size` to bisect them.
done when — the per-deck cost regression is found and fixed or explained, and the nightly
            has at least 2x headroom under its limit (by a fix, by sharding into parallel
            jobs, or by `--format html` once its parity is on record).
evidence  — two consecutive nightly `⏱ sweep cost` lines under 1350 s.
verify    — a `workflow_dispatch` run of overflow-nightly on the fix branch.
