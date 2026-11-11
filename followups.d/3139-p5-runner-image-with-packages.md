---
origin: 3139
priority: P5
recorded: 2026-11-11
area: infra
severity: low
swimlane: engineering/gotchas/ci.md
deferred: large — a prebuilt container or custom runner image is its own project; also blocked — the owner handed apt-outage prevention to another session on 2026-11-11 (session_01DPMMjFTjN3Mznmp4YjzVix); this PR fixed the outage itself
source: https://github.com/Laticent/lattice/pull/3139
---
# Take apt off the hot path with an image that already has the packages

why now   — the cache cuts the mirror out of most runs, but a miss or a repair still reads it. An image with poppler,
            imagemagick, the emoji font and Playwright's packages installed would not.
where     — ci.yml, the nightlies, a container image or a larger-runner image.
done when — the integration, golden and Playwright jobs run in that image and no apt step remains.
evidence  — engineering/gotchas/ci.md: "Removable when: the runner image carries the packages".
verify    — a job log with no apt step.
