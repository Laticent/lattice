---
origin: 2361
priority: P2
recorded: 2026-09-25
---

# 627 changelog fragments wait on a release fold that has never run

why now   — no release has run since 1.0.0, so `tools/release.js` has never folded a fragment. The
            first fold will be about 627 files at once.
where     — `changelog.d/`, `tools/release.js`, `RELEASE.md`.
done when — a dry-run fold over the current fragments produces a sane CHANGELOG section and bump.
evidence  — the dry-run output attached to the PR or issue.
verify    — tier 1 checker; the release itself stays an owner dispatch.
