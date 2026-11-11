---
origin: 3139
priority: P3
recorded: 2026-11-11
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — the owner handed apt-outage prevention to another session on 2026-11-11 (session_01DPMMjFTjN3Mznmp4YjzVix); this PR fixed the outage itself
source: https://github.com/Laticent/lattice/pull/3139
---
# Measure the apt mirrors from a GitHub runner, not from a sandbox

why now   — #3139's mirror order rests on measurements from a cloud sandbox behind a proxy (20 fetches each, 2026-11-11
            15:26 UTC; 5 timed downloads, 15:46 UTC). GitHub's runners sit in Azure, where azure.archive may be the
            fastest mirror when its DNS works.
where     — .github/actions/apt-cached/apt-setup.sh (the order); a nightly or on-demand probe.
done when — a runner-side probe records DNS time, first byte and download speed per mirror over a week, and the order in
            apt-setup.sh cites it.
evidence  — engineering/gotchas/ci.md, the entry on "Temporary failure resolving 'azure.archive.ubuntu.com'".
verify    — the probe's table in its run summary.
