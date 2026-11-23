---
origin: 3471
priority: P4
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §5
deferred: large — it depends on how slice F shapes weekly releases, which is its own PR after 1.0.0
source: https://github.com/Laticent/lattice/pull/3471
---
# Decide whether a library-only release gets a GitHub Release

why now   — only the engine gets a GitHub Release (v<version>). A weekly release that moves only libraries
            publishes and tags them with no Release page, so it is invisible on the repository's Releases tab.
where     — tools/release.js publish(), .github/workflows/release-publish.yml.
done when — slice F records the choice, and a library-only dry run produces the agreed Release (or none).
evidence  — a dry-run release body for a library-only release.
verify    — tier 1 checker, because it changes a public surface.
