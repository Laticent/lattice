---
origin: 3145
priority: P1
recorded: 2026-11-12
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: blocked — it can be observed only after #3145 merges and apt-cache-warm.yml runs on main
source: https://github.com/Laticent/lattice/pull/3145
---
# Prove a fresh PR restores the apt cache entry the warmer saved on main

why now   — the warmer's core claim. #3145 proved it saves and hits entries in a PR's own cache scope, and that a PR
            job computes the same key as the warmer row (golden-diff and integration restored
            apt-ubuntu24-X64-80a7170033b0b09e-20261101.360.1). The restore across scopes, a PR reading main's entry, rests on
            GitHub's documented rule until a log shows it. The pre-merge card graded MEDIUM on exactly this.
where     — any PR opened after the warmer has run on main, best the first after a runner-image bump; and a main run of
            studio-e2e-nightly.yml's firefox-webrtc job, whose `gh` key the warmer's container row must match.
done when — a PR's ci.yml apt step logs `Cache restored from key: apt-…-<image>` for an entry no run on that PR saved,
            with cache hit and mirror read none; and the firefox-webrtc job's key equals the warmer container row's.
evidence  — the PR #3145 card's `raise it` line.
verify    — read the two job logs; quote the lines in the PR that deletes this file.
