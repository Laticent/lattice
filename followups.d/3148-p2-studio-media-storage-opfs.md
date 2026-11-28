---
origin: 3148
priority: P2
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-22-local-first-drive-storage.md §10 slice 2
deferred: large — photos and videos moved in vault slice 2; each remaining kind has its own store, writers and move, past that PR's 1.5k-line budget
---

# Move reference PDFs, themes and other asset kinds, and narration audio, into the storage vault

Narrowed 2026-11-27 by vault slice 2 (`engineering/decisions/2026-11-27-vault-slice-2-as-built.md`). The owner's
question (2026-11-12, why images live in IndexedDB) is answered: decision D1 on #3442 chose the vault, and Library
photos and videos now keep their bytes there, moved once behind one automatic backup.

why now   — design §10 slice 2 names "photos, videos, PDFs, themes and other kinds; narration audio". Until the rest
            move, a sync in slice 6 has to read two stores.
where     — docs/src/components/studio/reference-doc-store.ts (a PDF `blob` or `data`, a deck `deckData`);
            library/asset-store.js theme, component, finish, scene and plugin records (text in the row, versioned by
            asset-history.js); docs/src/playground/narration-store.js (its own database, `lattice-narration`, a cache).
            Follow media-vault.ts and media-vault-move.ts: bytes in the vault, metadata in the row, one move.
done when — each kind's bytes are in the vault under §6.1's folder (`Library/Documents`, `Library/Themes`, …, `Audio`),
            the move covers it under the same backup, and the narration cache's eviction still works.
evidence  — the storage bench (`MEASURE=open,export`) before and after; e2e on desktop, webkit-tablet and gecko; iOS
            eviction with photos in the vault on a real iPhone, or UNVERIFIED and handed to the devices desk.
verify    — tier 2: the adversarial trio, since it moves user data.
