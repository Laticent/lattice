---
origin: 2595
priority: P2
recorded: 2026-10-07
area: infra
severity: high
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# Slice E: the first publish, which is 1.0.0

why now   — trusted publishing (OIDC) can only be attached to a package that already exists.
where     — the automation environment's NPM_TOKEN (short-lived, granular); the plan's §5 E and §7
            (the draft highlights for release-notes/1.0.0.md).
done when — ltt publishes first, then the other eight libraries, then @laticent/lattice@1.0.0 with
            the curated notes; a trusted publisher is attached to each of the ten; the token is
            revoked; a clean-room  works from the registry.
evidence  — npm view for all ten, the provenance badge, the clean-room PDF via SendUserFile.
verify    — owner gate (the token and the npm UI), and tier 1 on the notes text (prose-checker).
