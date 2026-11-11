---
origin: 3129
priority: P3
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-11-studio-storage-pointer-records.md §10
deferred: off-path — found by #3129's checker; the restore summary predates #3129, which made the refusal visible
source: https://github.com/Laticent/lattice/pull/3129
---

# A backup restore counts a deck whose save was refused as restored

why now   — `importStudioState` calls `saveSource` and counts the deck as added whatever it returns. Since #3129,
            `saveSource` returns false on a refused write and the Studio shows a notice, but the restore summary
            still reports the deck as restored.
where     — `studio-store.ts` `importStudioState` (each `saveSource` call), the summary it returns, and its use in
            `workspace-backup.ts`.
done when — A refused deck is counted as not restored and named in the summary's "not restored" list.
evidence  — #3129 checker report, recorded in the note's §10.
verify    — A unit test that fakes a full quota during `importStudioState` and checks the summary.
