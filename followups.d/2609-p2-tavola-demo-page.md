---
origin: 2609
priority: P2
recorded: 2026-10-08
area: website
severity: medium
swimlane: engineering/decisions/2026-10-08-library-audit.md
source: https://github.com/Laticent/lattice/pull/2609
---

# Give Tavola a demo page at /tavola before it publishes

why now   — owner ruling 2026-10-08 (library audit §6): Tavola needs a demo page. Today its home
            card and nav entry link to its GitHub README, the only library besides LTT without one.
where     — docs/src/pages/tavola.astro (new), docs/src/lib/nav.mjs (drop `external`, point at the
            page, set `match: ['tavola']`), nav.test.ts.
done when — /tavola shows a live session between two peers without making a visitor open a second
            browser (for example, two in-page panes joined over a local transport), and the nav and
            home card link to it.
evidence  — tools/screenshot.js at 1440, 820 and 390, light and dark.
verify    — QUALITY BAR visual review.
