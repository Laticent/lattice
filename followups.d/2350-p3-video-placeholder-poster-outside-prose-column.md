---
origin: 2350
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2350
---

# The re-hosted video placeholder poster hangs outside the prose column

why now   — seen driving Studio Read · Article for #2350: with no thumbnail, a video's
            re-hosted `.video-poster.is-placeholder` renders as a bare "Watch on
            YouTube" link left of the prose column at 1440 and 820 (the figure breakout
            grid), with the caption centered far from it. Pre-existing.
where     — `projectMedia` output for video + the article figure styles
            (`.st-read-article` in docs/src/components/studio/ReadArticle.tsx, and the
            player-core twins).
done when — a placeholder poster reads as a deliberate card or link inside the column
            on all three widths.
evidence  — tools/screenshot.js at 1440/820/390, before and after.
verify    — tier 0, plus the visual review path.
