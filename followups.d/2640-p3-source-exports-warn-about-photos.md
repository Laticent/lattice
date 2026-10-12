---
origin: 2640
priority: P3
recorded: 2026-10-12
area: website
severity: low
swimlane: engineering/decisions/2026-10-12-library-media-assets.md
source: https://github.com/Laticent/lattice/pull/2640
---

# `.lattice`, Markdown and Marp exports ship `asset:x` without the picture and without a warning

why now   — The inversion review of PR #2640: a presenter who sends a `.lattice` to a co-presenter gets stand-ins
            in the meeting, and the Share sheet says "ready." The same applies to the PDF's "re-openable in
            Lattice" embed. The design note lists carrying photos in these formats as an open question.
where     — `docs/src/components/studio/ShareSheet.tsx` `SOURCE_EXPORTS`; `share-export.ts` `shareLattice`.
done when — A `.lattice` export of a deck that names a photo either contains the photo or the toast says which
            photos it does not carry; an e2e asserts it.
