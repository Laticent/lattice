---
origin: 2354
priority: P8
recorded: 2026-10-16
area: website
severity: medium
swimlane: docs/e2e/workspace-backup-size.spec.ts
source: https://github.com/Laticent/lattice/pull/2354
---

# A backup with 67 MiB of reference docs restores the deck but stores none of the docs

why now   — `workspace-backup-size.spec.ts` "a real-shaped backup with 67 MiB of reference docs
            still restores" fails on `main` (a clean worktree of `6e7c738`, built and run
            alone in the #2354 sandbox, 2026-10-16): the "Workspace restored" toast shows, but after
            the reload IndexedDB holds 0 of the 10 refdocs (expected 10). Older than #2354, whose
            diff does not touch restore. Found while re-running #2354's e2e after a merge of main.
where     — docs/src/components/studio/workspace-backup.ts (restore of refdocs.json) and the
            reload that follows it; the spec's line ~120 is the failing assertion.
done when — the spec passes on the PR gate's Chromium, and a 67 MiB refdocs restore keeps all 10.
evidence  — the spec green, plus the stored-name count it records in its `control` row.
verify    — tier 1 checker: restore writes user data, and a silent loss is the failure mode.
