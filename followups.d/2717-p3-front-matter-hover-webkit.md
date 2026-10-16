---
origin: 2717
priority: P3
recorded: 2026-10-16
area: website
severity: low
swimlane: engineering/decisions/2026-10-15-conformance-harness.md §9
---

# Drive the Studio front-matter key hover and completion on WebKit

why now   — #2717 verified the new key hover and the icon/avatar/plugins completion on Chromium at 1440/820/390 only; the phone sheet is the surface where a tooltip most often misplaces
where     — docs/src/components/studio/Editor.tsx (hoverTooltip), editor-complete.ts frontMatterKeyAt
done when — the hover and the avatar completion are driven on the webkit-phone and webkit-tablet projects
evidence  — Playwright screenshots from the webkit-* projects
verify    — tier 0
