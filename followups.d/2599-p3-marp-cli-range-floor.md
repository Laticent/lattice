---
origin: 2599
priority: P3
recorded: 2026-10-08
area: engine
severity: low
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
source: https://github.com/Laticent/lattice/pull/2599
---

# Drive the Marp bundle at the bottom of its marp-cli range

why now   — the bundle's package.json pins marp-cli `^4.3.1` (`MARP_CLI_RANGE`), and the integration
            test resolves the newest 4.x. #2589 and #2599 measured the allowlist, the functional
            `engine:` and the notes hook only on marp-cli 4.5.1 / marp-core 4.4.0. A recipient whose
            lockfile holds 4.3.1 runs a config nobody rendered there.
where     — lib/core/marp-bundle.js `MARP_CLI_RANGE`; test/integration/export/marp-bundle-author-script.test.js.
done when — the integration test passes with marp-cli pinned to exactly 4.3.1, or the range's floor
            is raised to the oldest version that passes, with the reason in the PR.
evidence  — the integration run's pass/fail table at 4.3.1 and at the newest 4.x.
verify    — tier 0 gates, because it only re-measures shipped code (tier 1 if it forces a code change).
