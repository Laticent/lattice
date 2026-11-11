---
origin: 3139
priority: P1
recorded: 2026-11-11
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: blocked — the owner handed apt-outage prevention to another session on 2026-11-11 (session_01DPMMjFTjN3Mznmp4YjzVix); this PR fixed the outage itself; it also adds a CI job, which is the owner's call
source: https://github.com/Laticent/lattice/pull/3139
---
# Keep every apt and Playwright cache entry warm on main

why now   — GitHub caches are scoped by branch: a PR restores its own entries or main's. Only package lists that a nightly on
            main also uses get an entry on main (golden-bless, integration-nightly, webkit-baselines). Any other list misses
            on every new PR and reads Ubuntu's mirror, which is what failed on 2026-11-11. GitHub's roughly weekly image bump
            also moves every key.
where     — .github/actions/apt-cached, .github/actions/playwright-browsers; a small scheduled workflow on main.
done when — one scheduled job on main calls both actions for every package list and browser set CI uses, and a fresh PR's
            jobs all log "Cache hit" or "Cache restored".
evidence  — PR #3139 review: ci.yml's integration list had no main warmer until #3139 moved it onto golden-diff's list.
verify    — open a PR the day after an image bump; no job's apt step logs a Get: line.
