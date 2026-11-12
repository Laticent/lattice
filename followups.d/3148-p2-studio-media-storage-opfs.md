---
origin: 3148
priority: P2
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-11-studio-storage-pointer-records.md §3
deferred: blocked — the owner's decision: moving stored photos is a migration of every user's saved data
---

# Decide whether Library photos, videos and reference PDFs move from IndexedDB to the Origin Private File System

why now   — The owner asked (2026-11-12) why images live in IndexedDB, expecting it to hold metadata only. Today photos,
            videos, saved themes and reference PDFs are Blobs in IndexedDB `lattice-workbench/assets`; the storage note
            measured them as costing nothing at boot (only decks and versions were moved to metadata-first reads).
where     — docs/src/components/studio/library/asset-store.js, media-store.ts, media-urls.ts.
done when — the owner has chosen between: keep Blobs in IndexedDB (browsers store them as files outside the database
            already), or IndexedDB metadata plus OPFS files (one more storage API, a migration, and a quota and
            eviction story to re-test on iOS); and, if OPFS, a design note with the migration and its rollback.
evidence  — a measured comparison on a 50-photo Library: boot read, photo open, export, quota after eviction on iOS.
verify    — tier 2: the adversarial trio, since it migrates user data.
