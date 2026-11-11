---
origin: 3129
priority: P3
recorded: 2026-11-11
area: website
severity: low
swimlane: engineering/decisions/2026-11-11-studio-storage-pointer-records.md §4 item 2
deferred: off-path — not a boot cost: it runs only when Version history opens, and Filo slice 6 retires the store
source: https://github.com/Laticent/lattice/pull/3129
---

# Store each version's slide count instead of parsing every version to show it

why now   — The Version history list shows each version's slide count with `metaFor(cp.source)`
            (`StudioShell.tsx`, the version list row), a full parse of up to 25 deck copies when the list opens.
where     — `checkpoint-store.ts` (an optional `slides` field on each record, written at save),
            `studio-store.ts` `saveCheckpoint` / `saveCheckpointDurably`, the version list row in `StudioShell.tsx`.
done when — The list reads the stored count, falling back to `metaFor` for records saved before the field existed.
evidence  — engineering/decisions/2026-11-11-studio-storage-pointer-records.md §4 item 2.
verify    — A unit test that the list's row does not parse a version's source when `slides` is present.
