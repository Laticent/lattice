---
origin: 3037
priority: P6
recorded: 2026-11-22
area: website
severity: low
swimlane: engineering/decisions/2026-10-15-fuoco-focus-sync.md §12
deferred: off-path — logged from a session archive sweep; Fuoco and the docs site's page chrome are not touched by the PR that records it
source: https://github.com/Laticent/lattice/pull/3037
---

# Test Fuoco's "generic core" claim on a second real consumer, and note what 2-D would need

why now   — §12 says the core is generic and tests the claim on the `/fuoco` demo only (Markdown, a transcript and a
            code file through `createTextOutliner`). On main (164ecfa) every real consumer is a deck surface: the
            Studio and the Playground. The docs site's long pages (a table of contents, scrollspy, deep links) are
            the obvious second consumer, through `byHeadings`. If that needs a change in the core, the change shows
            where the core is still deck-shaped.
            Item B, a design note only and not a commitment: Fuoco's focus is 1-D (unit, part, offset). A
            spreadsheet would need a 2-D address (row and column, or a cell range), and the note should say what
            that does to `Outline`, `go()` and the change span before anyone builds on the 1-D shape.
where     — docs/src/lib/fuoco (the core, `byHeadings`, `createTextOutliner`); the docs site's long-page layout and
            its table of contents; engineering/decisions/2026-10-15-fuoco-focus-sync.md §12 for the note.
done when — one long docs page runs its table of contents, scrollspy and deep links on Fuoco, with any core change
            named in a decision note; and that note has a short section on a 2-D address.
evidence  — `git grep -l fuoco -- docs/src/components` lists only Studio and Playground files.
verify    — the page at 1440, 820 and 390 px (`tools/screenshot.js`); the core still typechecks alone
            (`docs/tsconfig.fuoco.json`) and passes `checkFuocoBoundary`.
