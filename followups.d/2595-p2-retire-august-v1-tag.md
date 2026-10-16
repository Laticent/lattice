---
origin: 2595
priority: P2
recorded: 2026-10-07
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# Slice D: retire the August v1.0.0 tag as a v0.9.0 preview

why now   — the recut 1.0.0 needs the v1.0.0 name, or per-package tags must explain the old one.
where     — the v1.0.0 tag (5979ae9) and its GitHub Release; the plan's §2 ruling 1 and §5 D.
done when — v0.9.0 tags the same commit, its Release is marked pre-release and titled a preview,
            and v1.0.0 no longer exists. Confirm with the owner at the time: it is externally visible.
evidence  — the GitHub releases API listing before and after.
verify    — tier 0, after the owner's go-ahead.
