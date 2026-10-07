---
origin: 2595
priority: P1
recorded: 2026-10-07
area: infra
severity: high
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# Slice C: Changesets in, the 915 fragments archived, release notes split

why now   — independent library versions need a multi-package release, and the root package
            cannot publish alone (it depends on five unpublished libraries); this blocks 1.0.
where     — release.yml, release-publish.yml, tools/release.js, tools/changelog.js,
            changelog.d/README.md, RELEASE.md, CLAUDE.md HARD RULE #10; the plan's §3 and §5 C,
            and 2026-08-09-changesets-multi-package-release.md §"The five decisions".
done when — a dry-run release produces per-package versions (lattice 1.0.0, libraries 0.1.0),
            per-package tags (@laticent/lattice@1.0.0), notes built from each changeset's first
            line, the 915 fragments archived into changelog/pre-release-archive.md, and a gate
            that requires a changeset on a PR touching published source (Dependabot exempt).
evidence  — the dry-run output: versions, tag names, notes body length under 125,000 characters.
verify    — tier 2 adversarial trio, because the release pipeline publishes irreversibly.
