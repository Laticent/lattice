---
origin: 2361
priority: P3
recorded: 2026-09-26
---

# Line charts leave the slide's sides empty; chart slides color their eyebrow differently

why now   — found while polishing the model-choice slide of the agentic-practices talk.
            (1) The line chart's SVG keeps a fixed aspect ratio and fits the slide's height,
            so on a 16:9 slide the plot takes about half the content width and leaves wide
            empty sides. Its axis labels come out small on a room display. The line gallery
            shows the same shape. The talk worked around it by dropping its subtitle to free
            height. (2) On `line` and `roadmap` slides, the small label above the heading
            (the eyebrow) renders in the accent color. Every other component renders it in
            muted gray, so it changes color mid-deck. This may be deliberate chart-family
            styling; if so, record why.
where     — lib/components/chart/line/line.transform.js (viewBox width) and the shared
            Cartesian substrate in lib/components/chart/_chart-family/; the eyebrow color
            in chart-family CSS or roadmap.styles.css.
done when — a two-series line chart with five points fills most of the content width on a
            16:9 slide without clipping its end labels, and the eyebrow color either matches
            the other components or has a written reason.
evidence  — the line gallery at 4k before and after, and one deck mixing `list` and `line`
            slides.
