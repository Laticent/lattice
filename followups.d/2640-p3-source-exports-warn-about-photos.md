---
origin: 2640
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# Markdown, Marp, embedded `.lattice` and live collaboration do not carry the Library photos a deck names

why now   — A standalone `.lattice` now carries its photos (the Lattice row's "Include photos" switch). Four other
            ways a deck leaves the browser still ship `asset:x` without the picture, so the recipient sees
            stand-ins: the Markdown export, the Marp bundle, the `.lattice` a re-openable PDF or PowerPoint
            embeds (its reader is capped at 25 MB, `MAX_ZIP_BYTES`), and live collaboration.
where     — `docs/src/components/studio/share-export.ts` `shareMarkdown`, `shareMarp`, `embeddableLattice`;
            `docs/src/components/studio/embedded-source.ts` (the 25 MB cap); the live channel under
            `docs/src/components/studio/live/`. `lattice-media.ts` is the pack and restore pair to reuse.
done when — Each of the four either carries the photo or the recipient's Studio asks to fetch it, and an e2e opens
            the output in a fresh browser profile and sees the picture.
