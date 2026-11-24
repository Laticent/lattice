---
origin: 3385
priority: P1
recorded: 2026-11-23
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-18-platform-suites.md
deferred: blocked — the suite runs `docs/scripts/ios-safari/engine-retry.mjs`, which reaches main only with #3385; the owner approved it as its own PR (2026-11-22)
source: https://github.com/Laticent/lattice/pull/3385
---

# A nightly iOS engine-retry suite, iPhone and iPad

why now   — the engine-retry probe (an engine sub-file that fails to load, and whether the preview's way back works in
            real Mobile Safari) runs only on a manual `platform-suites.yml` dispatch: the Studio iPad suite ends near its
            30-minute job cap, so `run.mjs` skips the probe on the nightly. Nothing catches a Safari regression in the
            failure card's recovery between dispatches. The owner said yes to a separate nightly suite for both devices in
            this PR's session (2026-11-22), at a measured ~13–14 macOS minutes per device per night (free on a public repo).
where     — `.github/platform-suites.json` (two entries, `on_pull_request: false`), `docs/scripts/ios-safari/run.sh`
            (a `PROBE=engine-retry` that runs only `runEngineRetryProbe`, drop then 503), and `run.mjs`, whose Studio
            suite then stops running the probe even on a dispatch.
done when — `ios-safari-engine-retry-iphone` and `-ipad` exist, each dispatched once green, and the next nightly runs them.
evidence  — the two dispatch runs; the nightly that follows.
verify    — tier 1: one checker, because it adds a CI job (CLAUDE.md SECOND FILTER: approved by the owner).
