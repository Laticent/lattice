---
origin: 3451
priority: P3
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md §9
deferred: large — three demo pages, catalog entries and marks, each a visual docs-site job owing screenshots at three widths
source: https://github.com/Laticent/lattice/pull/3451
---

# markup, lastra and segno-markdown publish to npm with no docs-site page

why now   — #3451 made them publishable; every other published library has a page on /libraries/.
where     — docs/src/content/catalog/libraries/<slug>.md, docs/src/pages/libraries/<slug>/index.astro, docs/src/lib/nav.mjs.
done when — each has a catalog entry and a demo page, or the owner rules they stay plumbing with no page.
evidence  — docs/src/lib/nav.test.ts `unlisted` names the three.
verify    — remove a name from `unlisted`; nav.test.ts passes only once its page exists.
