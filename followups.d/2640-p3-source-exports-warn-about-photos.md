---
origin: 2640
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# `.lattice`, Markdown and Marp exports do not carry the Library photos a deck names

why now   — The Share sheet now says which photos are not inside these files (PR #2640), but the file still ships
            `asset:x` without the picture, so a co-presenter who opens a `.lattice` elsewhere sees stand-ins. The
            same holds for live collaboration, which the design note does not cover. Carrying the bytes needs a safe
            read side (the sanitizer and size rules of backup restore).
where     — `docs/src/components/studio/share-export.ts` `shareLattice`; the live-collaboration channel under
            `docs/src/components/studio/live/`.
done when — A `.lattice` export of a deck that names a photo contains the photo (or the recipient's Studio asks to
            fetch it), and an e2e opens the exported file in a fresh browser profile and sees the picture.
