---
origin: 3326
priority: P3
recorded: 2026-11-20
area: infra
severity: low
swimlane: engineering/gotchas/ci.md §`player no-JS (WebKit)` or an iOS undo job is cancelled at its limit with no test failed
deferred: blocked — the fix changes a platform-suites job (its limit, or one job per device), which is a CI-contract decision for the owner
source: https://github.com/Laticent/lattice/pull/3326
---

# The `ios-safari-photo` job can run out of its time limit on a slow hosted Mac before the iPhone probe starts

why now   — dispatch 44651836892 (job 136024348238, at d0f0e00) was cancelled at about 31 minutes with no test
            failed. The iPad passed, with about 3 minutes of probe time. The iPhone simulator then took about 7 minutes
            from creation to boot, and Safari took 193 s to launch (3 to 63 s in the other runs on #3326), so the job
            ended about 90 s after the iPhone session opened, before the probe reported anything. It is the only
            cancelled `ios-safari-photo` job in about 300 platform-suite runs. The undo suite hit the same limit and
            was split into one suite per device (`ios-safari-undo-ipad`, `-iphone`, `-mac`).
where     — `.github/platform-suites.json` (`ios-safari-photo`), `.github/workflows/platform-suites.yml`,
            `docs/scripts/ios-safari/run.sh` (`DEVICES`).
done when — the owner picks one option: split the photo suite per device, as the undo suite was; raise its
            limit; or accept the rare cancellation, which the supervisor re-runs once
            (`platform-suites-supervisor.yml`). Then the choice is made, or this item is deleted.
evidence  — a slow-runner dispatch that finishes both devices, or the owner's ruling.
verify    — platform-suites.yml dispatch, suites=ios-safari-photo.
