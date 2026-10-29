---
origin: 2950
priority: P3
recorded: 2026-10-28
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-21-playground-focus-sync.md §The iOS suites restart a stuck start
deferred: blocked — the done-when is 10 nightly runs on main, which only time produces
---

# Confirm the iOS suites' start restart over 10 nightlies

why now   — `main`'s nightly failed on an iOS suite on each of its first three days with them (runs 40307494617,
            40485085426, 40674748940), every time because safaridriver never created a session. #2961 answers that
            with a second session attempt and, where the job has time, one full restart (reboot, Safari relaunch,
            safaridriver restart). A handful of runs is not a trend.
where     — `docs/scripts/ios-safari/run.sh` and `run.mjs`; the nightly `platform-suites.yml` runs on `main`.
done when — 10 consecutive nightly runs on `main` with no iOS job ending in "no session after two starts" or
            "session not created" as its failure.
evidence  — the list of the 10 nightly run ids with each iOS job's result, and how many of them logged
            "session not created (attempt 1" or "no session on start 1 of 2" (each one is a failure that was absorbed).
            If the Studio suite logs "no second start", that is the deadline at work: raising the job's
            `timeout-minutes` is the owner's call (it changes the CI contract).
verify    — tier 1: self-review with the gates; read the nightly logs, not only the job color.
