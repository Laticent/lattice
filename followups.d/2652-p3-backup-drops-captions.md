---
origin: 2652
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2652
---

# A workspace backup does not carry photo captions

why now   — The chat now saves a one-line caption on each Library photo it looks at (`MediaRecord.caption`).
            `workspace-media.ts` writes and reads an explicit field list, so a restore brings back the photo
            without its caption. The chat looks at the photo again and re-captions it: one thumbnail's cost,
            nothing lost for good.
where     — `docs/src/components/studio/workspace-media.ts` (the row written at line ~87 and the row read at
            line ~299).
done when — A backup row carries `caption`, a restore reads it through `cleanCaption`, and
            `workspace-restore-photos.test.ts` has a round-trip case.
