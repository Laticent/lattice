---
origin: 2853
priority: P3
recorded: 2026-10-21
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2853
---

# Decide whether the Imported tag survives a backup restore

why now   — a real backup restored on an empty device brings every item back but not the Imported tag: the backup's
            library.zip is package folders, which carry no `origin`. docs/e2e/library-backup-restore.spec.ts pins the
            untagged result as the current contract.
where     — docs/src/components/studio/workspace-backup.ts (restore path), the package format if `origin` is to travel.
done when — the owner picks: keep the tag as "arrived this session" (nothing to do), or carry `origin` in the package.
evidence  — the changed spec, if the tag is kept across a restore.
verify    — npm run test:e2e -- e2e/library-backup-restore.spec.ts
