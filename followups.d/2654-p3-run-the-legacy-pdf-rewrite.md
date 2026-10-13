---
origin: 2654
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: docs/src/components/studio/reference-doc-store.ts
source: https://github.com/Laticent/lattice/pull/2672
---

# Run the rewrite of old base64 reference PDFs, once rolling back is no longer realistic

why now   — #2672 stores new PDFs as binary and leaves old ones as base64 text. The old records still read and
            download; they just keep the third of extra disk and the string in memory until they are rewritten.
            The rewrite is held back because it would make every PDF a person owns unreadable to a build from before
            #2672 (new saves already are); see "The cost, stated plainly" in the library-media note.
where     — `migrateLegacyRefDocs` in reference-doc-store.ts (built, compare-and-swap, tested, not called);
            call it from `Library.tsx` `reload`, once per open panel, as the first version of #2672 did.
done when — the call is back, a Playwright run shows an old record rewritten as binary on Library open (the
            spec `docs/e2e/library-refdoc-binary.spec.ts` currently asserts the opposite and flips), and the
            changelog says old PDFs are rewritten.
evidence  — the Playwright run, and the release this lands in being one nobody is expected to roll back past.
verify    — tier 1. Why it waits: an older build that reads a rewritten record cannot see its PDF.
