---
origin: 3139
priority: P3
recorded: 2026-11-11
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: blocked — the probe shipped in the apt-outage-guards PR; setting the order needs a week of its runs on main, which start only after it merges
source: https://github.com/Laticent/lattice/pull/3139
---
# Set apt-setup.sh's mirror order from a week of runner-side probes

why now   — #3139's mirror order rests on measurements from a cloud sandbox behind a proxy (20 fetches each, 2026-11-11
            15:26 UTC; 5 timed downloads, 15:46 UTC). GitHub's runners sit in Azure, where azure.archive may be the
            fastest mirror when its DNS works. apt-mirror-probe.yml now measures every listed mirror from a runner every
            four hours and ranks the past seven days in its run summary.
where     — .github/actions/apt-cached/apt-setup.sh (the order, and the comment that cites the measurement), and the
            inline copy of the list in studio-e2e-nightly.yml's firefox-webrtc git step.
done when — apt-setup.sh's order follows the ranking of a scheduled apt-mirror-probe run on main that covers seven days
            (about 42 runs), and its comment cites that run.
evidence  — engineering/gotchas/ci.md, the entry on "Temporary failure resolving 'azure.archive.ubuntu.com'".
verify    — the probe's "past seven days on main" table in its run summary.
