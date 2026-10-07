---
origin: 2595
priority: P3
recorded: 2026-10-07
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# Slice F: weekly fully automatic releases

why now   — the owner's ruling 4; until it lands, every release is a manual dispatch.
where     — release.yml (a schedule trigger), the version PR's auto-merge, the OIDC publish step,
            CLAUDE.md rule 7's list of PRs that merge themselves; the plan's §5 F.
done when — two consecutive weekly runs: one that releases, one that no-ops with no changeset.
evidence  — the two workflow runs and the published versions.
verify    — tier 1 checker, because it adds a scheduled trigger that publishes without a human.
