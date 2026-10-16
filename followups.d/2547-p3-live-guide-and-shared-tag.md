---
origin: 2547
priority: P3
recorded: 2026-10-06
area: docs
severity: low
swimlane: engineering/decisions/2026-10-06-live-collaboration-roadmap.md
source: https://github.com/Laticent/lattice/pull/2547
---

# Add a user guide page and the Shared-by tag

why now   — there is no docs-site page for live sessions, and the guest's copy has no Shared by tag in the deck switcher (§5.5).
where     — docs/src/content/docs/guides/, docs/astro.config.mjs sidebar, the deck switcher in StudioShell.tsx.
done when — a guide page explains starting, joining, roles and limits, and a linked copy shows its tag.
evidence  — tools/screenshot.js at 1440/820/390 of the page and the switcher.
verify    — tier 0 gates, because it is docs and one label.
