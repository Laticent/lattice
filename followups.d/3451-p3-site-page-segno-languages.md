---
origin: 3451
priority: P3
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §9
deferred: large — a demo page, a catalog entry and a mark, owing screenshots at three widths; and the package is being renamed first
source: https://github.com/Laticent/lattice/pull/3451
---

# segno-markdown (becoming segno-languages) publishes with no docs-site page

why now   — every published library is official and gets a page under /libraries/ (owner ruling 2026-11-23, first-npm-release §9). #3456 adds the Markup and Lastra pages; this is the one library of #3451's three still without one.
where     — docs/src/content/catalog/libraries/<slug>.md, docs/src/pages/libraries/<slug>/index.astro, docs/src/lib/nav.mjs. Do it under the new name, after the segno-languages rename (P5 of engineering/decisions/2026-11-22-segno-completion-plan.md).
done when — the page exists and the package leaves nav.test.ts's `unlisted` set.
evidence  — tools/screenshot.js at 1440, 820 and 390.
verify    — remove the name from `unlisted`; nav.test.ts passes only once its page exists.
