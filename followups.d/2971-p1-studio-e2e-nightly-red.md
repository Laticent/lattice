---
origin: 2971
priority: P1
recorded: 2026-10-29
area: infra
severity: high
swimlane: engineering/decisions/2026-10-29-ci-job-tiers.md
deferred: off-path — the nightly Studio e2e suite's own failures; #2971 changes what runs on a PR, not that suite
---

# Get studio-e2e-nightly green, so it can be the Studio's e2e signal again

why now   — `studio-e2e-nightly.yml` failed all 10 of its scheduled runs to 2026-10-28 (40674917008 back to
            39236134018; one of them cancelled). A suite that is always red tells no one anything, so #2971 kept
            `studio-smoke` on pull requests instead of moving it there, and that PR run is the Studio's only working
            browser check. #2912 covers one part of it (the sandbox specs).
where     — `.github/workflows/studio-e2e-nightly.yml`, the specs under `docs/e2e/`, and its rolling issue.
done when — 5 consecutive scheduled runs pass, or each remaining red spec has its own issue and is out of the run
            with that issue named.
evidence  — the 5 run ids, or the per-spec issue list.
verify    — tier 1: self-review with the gates; read the nightly logs, not only the run color.
