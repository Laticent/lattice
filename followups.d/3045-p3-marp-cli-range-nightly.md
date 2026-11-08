---
origin: 3045
priority: P3
recorded: 2026-11-08
area: infra
severity: low
swimlane: engineering/development.md §The Export-to-Marp suites run a pinned marp-cli
deferred: blocked — adding a CI job is the owner's call (CLAUDE.md SECOND FILTER, row 2)
---

# Keep the floating marp-cli range covered somewhere off the per-PR path

why now   — The Export-to-Marp suites now run an exact pin (4.5.1) instead of the newest release in `MARP_CLI_RANGE`
            (`^4.3.1`), so a new marp-cli 4.x that breaks the bundle would no longer show on a PR. The old weekly npx
            cache key gave that coverage as a side effect, at the price of 22 red integration runs in 30 days.
where     — `.github/workflows/integration-nightly.yml` (or a new scheduled job); `test/helpers/marp-cli.js` already
            honors `LATTICE_MARP_CLI=range`.
how       — one nightly step: `LATTICE_MARP_CLI=range node --test test/integration/export/marp-*.test.js`. A red night
            means bump the pin (and its lockfile) after fixing the bundle, or narrow the range.
done when — a scheduled run exercises the range and reports to the nightly's usual channel.
evidence  — one green nightly run's log naming the resolved marp-cli version.
verify    — self-review; the nightly's first run.
