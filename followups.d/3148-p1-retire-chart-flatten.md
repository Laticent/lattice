---
origin: 3148
priority: P1
recorded: 2026-11-12
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-11-deferred-asset-bytes.md §8.2
deferred: blocked — it changes exported bytes (anti-aliasing on five gallery chart slides), which needs the owner's export sign-off; the owner was asleep when it was measured
---

# Retire `flattenChartSvgs`, the html-to-image workaround the slide camera does not need

why now   — It costs 10.8 s of a WebKit (iPhone) print of a deck with nine heatmaps, 1.1 s in Chromium, every capture
            export. Its comment says it exists because html-to-image dropped the stylesheet from SVG charts; the slide
            camera lays every slide out with the page's own stylesheet (the 2026-10-25 note in deck-export.js says so).
where     — docs/src/components/studio/export/deck-export.js `sectionsOf` → `flattenChartSvgs`.
done when — the capture exports skip it, every chart kind is checked in Chromium and WebKit for print, PDF, PowerPoint
            and images, and the owner has signed off on the rendered pages.
evidence  — measured 2026-11-12 by skipping it: the owner's deck printed byte-identical in Chromium and WebKit and the PDF
            export was identical; WebKit print 68.6 s → 57.6 s. The gallery deck's PDF export was identical on all 120
            pages; its print differed on pages 83 and 91–94 (hub-spoke and neighbors), by anti-aliasing only: no pixel
            more than 16/255 apart at 50 dpi, visually identical (rendered side by side).
verify    — tier 1: maker-checker, plus the export sign-off (light and dark renders of the chart slides).
