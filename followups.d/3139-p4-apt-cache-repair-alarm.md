---
origin: 3139
priority: P4
recorded: 2026-11-11
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — the summary line shipped (session_01DPMMjFTjN3Mznmp4YjzVix); the alarm adds a step to a nightly workflow, which is the owner's call (CLAUDE.md, second filter, row 2)
source: https://github.com/Laticent/lattice/pull/3139
---
# Alarm when the same apt cache repair repeats night after night

why now   — each apt-cached call now writes hit / fallback / miss and any repair to its job's summary, but nobody reads
            a nightly's summary unless it fails. A cache entry that no longer fits repairs from the mirror on every run,
            so the outage exposure comes back quietly.
where     — a nightly on main (golden-bless or integration-nightly), reading its own and the previous night's summary.
done when — a nightly fails, or posts to its tracking issue, when the same folder logs `repair` on two nights running.
evidence  — engineering/gotchas/ci.md: "A warning on every run means the repair is not reaching the cache".
verify    — force a misfit (as PR #3139's probe did) on two dispatches and see the alarm.
