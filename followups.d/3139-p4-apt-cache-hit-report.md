---
origin: 3139
priority: P4
recorded: 2026-11-11
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — the owner handed apt-outage prevention to another session on 2026-11-11 (session_01DPMMjFTjN3Mznmp4YjzVix); this PR fixed the outage itself
source: https://github.com/Laticent/lattice/pull/3139
---
# Report apt cache hits, misses and repairs in the step summary

why now   — a stale or misfitting cache entry shows only as a ::warning:: buried in a job log, on every run, until someone
            deletes it. Nobody sees a repair that repeats.
where     — .github/actions/apt-cached/apt-cached.sh, action.yml.
done when — each call writes hit / fallback / miss / repair to $GITHUB_STEP_SUMMARY, and a nightly flags a repair seen on
            two nights running.
evidence  — engineering/gotchas/ci.md: "A warning on every run means the repair is not reaching the cache".
verify    — force a misfit (as PR #3139's probe did) and see the summary line.
