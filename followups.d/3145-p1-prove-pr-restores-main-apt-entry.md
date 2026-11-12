---
origin: 3145
priority: P1
recorded: 2026-11-12
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — the firefox-webrtc job's gh step runs only on main and landed after the last main nightly; no main run has logged its key yet (the first, run 43225213036, was queued at 13:13 UTC on 2026-11-12)
source: https://github.com/Laticent/lattice/pull/3145
---
# Compare the firefox-webrtc gh cache key on main with the warmer's container row

why now   — the last unproven link of the apt cache warmer. Its other half is proven on real runners: golden-bless on
            main saved apt-ubuntu24-X64-80a7170033b0b09e-20261101.360.1 at 09:39:07 (run 43181102241), and
            claude/flaky-integration's first run of any workflow restored it as an exact hit in all five integration and
            golden-diff jobs (run 43198148728). The container row is matched only indirectly: the same image tag, and git
            already in the image (the warmer asserts it), so the job's git step installs nothing and dpkg's package list,
            which a container key hashes, is the same in both.
where     — studio-e2e-nightly.yml's firefox-webrtc job on main, step "Install the gh CLI"; apt-cache-warm.yml's
            apt-container row (warmer run 43178717523, job 131049159918, logged
            apt-ubuntu24.04-X64-78a67c439380cc3e-d62894f27a29).
done when — that step on a main run logs the same key as the warmer's container row for the same image tag, or, if it
            differs, the row is fixed so they match.
evidence  — PR #3145's card, `raise it`.
verify    — quote both key lines in the PR that deletes this file.
