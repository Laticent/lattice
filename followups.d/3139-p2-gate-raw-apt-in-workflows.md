---
origin: 3139
priority: P2
recorded: 2026-11-11
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: blocked — the owner handed apt-outage prevention to another session on 2026-11-11 (session_01DPMMjFTjN3Mznmp4YjzVix); this PR fixed the outage itself
source: https://github.com/Laticent/lattice/pull/3139
---
# Fail build:check on a raw apt-get or --with-deps in a workflow

why now   — #3139 moved every apt install onto .github/actions/apt-cached and every browser onto playwright-browsers. Nothing
            stops a new job from calling apt-get or `playwright install --with-deps` directly and reading the mirror again.
where     — tools/check-ownership.js (a new check), .github/workflows/**.
done when — build:check fails on apt-get install / --with-deps in .github/workflows outside a sanctioned list with
            justifications (today: the inline git step in studio-e2e-nightly's container job, which runs before checkout).
evidence  — grep -rn "apt-get\|--with-deps" .github/workflows finds only that inline step on #3139's head.
verify    — a test arm that adds a raw apt-get to a fixture workflow and expects the gate to fail.
