---
origin: 2654
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: docs/src/components/studio/reference-doc-store.ts
source: https://github.com/Laticent/lattice/pull/2672
---

# Write reference PDFs as binary, once the release that reads them has shipped

why now   — #2672 ships a reader for binary PDF records and keeps writing base64 text, so that rolling back never leaves
            a PDF a previous build cannot see. Until the writer flips, PDFs keep the extra third of disk and every
            Library open still loads each one as a string.
where     — `WRITE_PDFS_AS_BINARY` in reference-doc-store.ts (set it `true`); call `migrateLegacyRefDocs` from the
            Library's `reload`, once per open panel. Both the binary writer and the compare-and-swap rewrite are built
            and tested (`reference-doc-blob.test.ts`).
done when — the constant is on in a release that follows the one carrying #2672, the Library rewrites old records on open
            (the Playwright spec `docs/e2e/library-refdoc-binary.spec.ts` gains an assertion that flips), the changelog
            says PDFs are stored as binary, and the library-media note's "writes base64, flips next release" paragraph
            is updated.
evidence  — a Playwright run showing a PDF added in the Library stored as a Blob of the file's size with no base64 text.
verify    — tier 1. Do not do this in the same release as #2672: the point of the wait is that a rollback of the next
            release lands on a build that reads what it wrote.
