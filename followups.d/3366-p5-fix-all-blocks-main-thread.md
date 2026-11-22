---
origin: 3366
priority: P5
recorded: 2026-11-21
area: website
severity: medium
swimlane: engineering/jank.md
deferred: off-path — Fix all's own implementation; #3366 changes only the test that clicks it
source: https://github.com/Laticent/lattice/pull/3366
---

# Fix all runs every fix synchronously in the click handler, blocking the page for seconds

why now   — measured while fixing editor-lint's "Fix all names a fix it refused" on #3366: choosing "Fix all issues" over a 500-issue deck took 6.6 s on webkit-phone alone and 16 to 22 s under four workers, all inside the click handler, so the page cannot paint or take input meanwhile. On a phone a large deck freezes the Studio for that long.
where     — the palette's "Fix all issues" command and the Fix all path it calls (docs/src/lib, the editor's lint integration)
done when — Fix all yields between batches (or runs off the main thread) so the page stays responsive and shows progress, and a test bounds the longest task it leaves on the main thread
evidence  — docs/e2e/editor-lint.spec.ts `runFixAllFromPalette` comment; #3366 commit that gave its click a 60 s budget
verify    — a long-task observer in the e2e test: no main-thread task over a chosen bound while Fix all runs on REFUSED_DECK
